const fs = require('fs');
const TwitchClient = require('twitch').default;
const ChatClient = require('twitch-chat-client').default;
const Cryptr = require('cryptr');
const cryptr = new Cryptr(process.env.SCK);
const uuid = require('uuid/v1');

const axios = require('axios');
const io = require("socket.io-client");

const token = process.env.TKN;
const username = process.env.UN;
const client_id = process.env.CID;

const {build, getCondition} = require('./utils/regex-builder');

const port = process.env.PORT || 5000;

let socket, twitchClient;

let channelStatus = {};

let followListeners = {};
let donationListeners = {};
let bitsListeners = {};
let subListeners = {};
let resubListeners = {};
let giftSubListeners = {};
let raidListeners = {};
let chatListeners = {};

let connectedBots = {};
let socketLookup = {};
let channelClientLookup = {};

let requestQueue = [];
let failedToConnect = [];

let DEBUG_ENABLED = false;

let IRCAT;
let IRCRT;
let IRCEXPIRES;

let clientConnections = {};
/*
	{
		client: obj,
		activeConnections: number
	}
*/

let debugLog = (msg) => {
	if(DEBUG_ENABLED || process.env.DEBUG_ENABLED) {
		console.log('(i) ' + msg);
	}
}

// Achievement Handlers
let newSubHandler = (channel, subInfo, msg) => {

	let {plan, userId} = subInfo;

	if(subListeners[channel]) {
		subListeners[channel].forEach(listener => {

			if(listener.condition === plan) {
				let achievementRequest = {
					'channel': channel,
					'achievementID': listener.achievement,
					'tier': plan,
					'userID': userId
				};

				requestQueue.push(achievementRequest);
			}
		});
	}
};

let newFollowHandler = (channel, msg) => {
	if(followListeners[channel]) {
		let achievementRequest = {
			channel,
			achievementID: followListeners[channel].achievement,
			userID: msg[0].id,
			user: msg[0].name
		}

		requestQueue.push(achievementRequest);
	}
}

let donationHandler = (channel, msg) => {
	if(donationListeners[channel]) {
		let achievementRequest = {
			channel,
			achievementID: donationListeners[channel].achievement,
			user: msg[0].name,
			amount: msg[0].amount
		}

		requestQueue.push(achievementRequest);
	}
}

let bitsHandler = (channel, msg) => {
	if(bitsListeners[channel]) {
		let achievementRequest = {
			channel,
			achievementID: bitsListeners[channel].achievement,
			user: msg[0].name
		}

		requestQueue.push(achievementRequest);
	}
}

let resubHandler = (channel, subInfo, msg) => {
	let {months, streak, plan, userId} = subInfo;
	
	let largestListener;

	if(resubListeners[channel]) {
		resubListeners[channel].forEach((listener) => {	
			if(Number.parseInt(listener.condition) <= months) {
				if(!largestListener) {
					largestListener = listener;
				} else {
					let largestDifference = months - Number.parseInt(largestListener.condition);
					let currentDifference = months - Number.parseInt(listener.condition);

					if(currentDifference < largestDifference) {
						largestListener = listener;
					}
				}
			}
		});

		if(largestListener) {
			let achievementRequest = {
				'channel': channel,
				'type': 'resub',
				'tier': plan,
				'userID': userId,
				'achievementID': largestListener.achievement,
				'cumulative': months
			};

			debugLog('Resub Achievement');
			debugLog(JSON.stringify(achievementRequest));

			requestQueue.push(achievementRequest);
		}
	} else if(subListeners[channel]) {
		newSubHandler(channel, subInfo, msg);
	}
};

let giftCommunitySubHandler = (channel, subInfo, msg, totalGifts) => {
	let achievementListeners = giftSubListeners[channel];
	let {plan, gifterUserId} = subInfo;
	let msgId = msg.tags.get('msg-id');

	achievementListeners.forEach(listener => {
		if(listener.condition <= totalGifts) {
			let achievementRequest = {
	            'channel': channel,
	            'achievementID': listener.achievement, //Stream Acheivements achievement
	            'type': msgId, //type of event (sub, resub, subgift, resub)
	            'userID': gifterUserId, //Person giving the sub
	            'tier': plan, // (PRIME, 1000, 2000, 3000)
	        }

	        debugLog('Community Sub Achievement');
	        debugLog(JSON.stringify(achievementRequest));

	        requestQueue.push(achievementRequest);			
		}
	})
}

let giftSubHandler = (channel, subInfo, msg, totalGifts) => {

	let achievementListeners = giftSubListeners[channel];
	let {months, plan, gifterUserId} = subInfo;
	
	achievementListeners.forEach(listener => {
		let condition;

		try {
			condition = Number.parseInt(listener.condition);
		} catch (e) {
			console.log('Gift Sub Condition could not parse to an integer');
		}
		
		if(condition <= totalGifts) {

	        let achievementRequest = {
	            'channel': channel,
	            'achievementID': listener.achievement, //Stream Acheivements achievement
	            'type': 'subgift', //type of event (sub, resub, subgift, resub)
	            'userID': gifterUserId, //Person giving the sub
	            'tier': plan, // (PRIME, 1000, 2000, 3000)
	        }

			debugLog('Gift Sub Achievement');
	        debugLog(JSON.stringify(achievementRequest));

        	requestQueue.push(achievementRequest);
        }
    });

	awardRecipient(channel, subInfo, msg);
	
};

let awardRecipient = (channel, subInfo, msg) => {
		
	let {plan, userId} = subInfo;
	let months;

	try {
		months = Number.parseInt(subInfo.months);
	} catch (e) {
		console.log('months could not parse into an integer');
	}

	if(months) {
		if(months > 1) {
	        console.log("got some resub listeners, check them...");
			if(resubListeners[channel]) {

				let largestListener;
	            
				resubListeners[channel].forEach((listener) => {	
					if(Number.parseInt(listener.condition) <= months) {
						if(!largestListener) {
							largestListener = listener;
						} else {
							let largestDifference = months - Number.parseInt(largestListener.condition);
							let currentDifference = months - Number.parseInt(listener.condition);

							if(currentDifference < largestDifference) {
								largestListener = listener;
							}
						}
					}
				});

				if(largestListener) {
					let achievementRequest = {
						'channel': channel,
						'type': 'resub',
						'tier': plan,
						'userID': userId,
						'achievementID': largestListener.achievement,
						'cumulative': months
					};

					debugLog('Award Recipient of Gift Achievement');
	        		debugLog(JSON.stringify(achievementRequest));

					requestQueue.push(achievementRequest);
				}
			}
		} else if(months === 1) {
			
			if(subListeners[channel]) {
				subListeners[channel].forEach(listener => {
					if(listener.condition === plan) {
						let achievementRequest = {
							'channel': channel,
							'achievementID': listener.achievement,
							'tier': plan,
							'userID': userId
						};

						requestQueue.push(achievementRequest);
					}
				});
			}
		}
	}
}

let raidHandler = (msg) => {
	let achievementListener = raidListeners[channel];

	let achievementRequest = {
		'channel': channel,
		'achievementID': achievementListener,
		'type': msg.tags.msgId,
		'userID': msg.tags.userId
	}

	requestQueue.push(achievementRequest);
};

let getAllowedListeners = (listeners) => {
	let allowedListeners = [];

	allowedListeners = listeners.filter(listener => {
		return listener.unlocked || listener.achType === "5"
	});

	return allowedListeners;
}

let chatHandler = (channel, msg, username) => {

	if(channelStatus[channel] && chatListeners[channel]) {

		let listeners = chatListeners[channel][username];
		if(listeners) {

			if(!channelStatus[channel]['full-access']) {
				listeners = getAllowedListeners(listeners);
			}
			//Found listeners from this user
			listeners.forEach(listener => {
				
				let regex = new RegExp(listener.query);
				let matches = msg.match(regex);
				if(matches) {
					//Listener found for 
					let match = true;

					let user = matches.groups.user;

					if(listener.condition) {
						if(listener.condition === 'occured') {
							//blank condition, just checking for message
							let achievementRequest = {
								channel,
								user,
								achievementID: listener.achievement
							};

							requestQueue.push(achievementRequest);
						} else {
							if(Array.isArray(listener.condition)) {
								//TODO: Handle multiple conditions
							} else {
								try {
									let {condition, operator, solution} = listener.condition;
							
									if(operator === '=') {
										operator = '===';
									}

									let award = false;
									let desired = matches.groups[condition];

									if(desired) {
										if(condition === 'time') {

											let desiredTime = desired.replace(/[\.,\s]*/g, '');
											let solutionTime = solution.replace(/[\.,\s]*/g, '');

											debugLog(eval(desiredTime + operator + solutionTime));

											award = eval(desiredTime + operator + solutionTime);

										} else if(isNaN(parseFloat(solution))) {
											//checking for string
											if(operator === '===') {
												award = desired === solution;
											}
										} else {
											let desiredNum = desired.replace(/[\.,\s]*/g, '');
											let solutionNum = solution.replace(/[\.,\s]*/g, '');

											award = eval(desiredNum + operator + solutionNum);
										}
									}

									if(award) {
										let achievementRequest = {
											'channel': channel,
											'achievementID': listener.achievement,
											'user': user
										}

										requestQueue.push(achievementRequest);
									}
								} catch(e) {
									console.log(e);
									console.log("*******************************");
									console.log("Error parsing chat listener");
									console.log("Channel: " + channel);
									console.log("Msg: " + msg);
									console.log("*******************************");
								}
							}
						}
					}
				}
			});
		}
	}

	if(msg.indexOf('!sachievement award ') === 0) {
		let data = msg.substr(20).split(" ");
		let target = data.shift();
		let achievement = data.join(" ");

		try {
			axios({
				method: 'post',
				url: process.env.API_DOMAIN + '/api/achievement/award/chat',
				data: {
					user: username,
					target,
					achievement,
					channel
				}
			});
		} catch (err) {
			console.log(">>> Issue manually awarding through chat");
		}
		
	}
	
};

let createClientConnection = async (forceID) => {

	let twitchClient = await TwitchClient.withCredentials(process.env.IRCCID, IRCAT, undefined, {
		clientSecret: process.env.IRCCS,
		refreshToken: IRCRT,
		expiry: new Date(IRCEXPIRES) || 0,
		onRefresh: async ({ accessToken, refreshToken, expiryDate }) => {
			let cat = cryptr.encrypt(accessToken);
			let crt = cryptr.encrypt(refreshToken);
			let expiryTimeStamp = ((expiryDate === null) ? 0 : expiryDate.getTime());

			await axios.put(process.env.API_DOMAIN + '/api/irc/init', {
				at: cat,
				rt: crt,
				expires_in: expiryTimeStamp
			});
		}
	});

	let chat = await ChatClient.forTwitchClient(twitchClient);

	await chat.connect();
	await chat.waitForRegistration();

	chat.onPrivmsg((channel, user, message) => {
		chatHandler(channel.substr(1).toLowerCase(), message, user);
	});

	chat.onAction((channel, user, message) => {
		chatHandler(channel.substr(1).toLowerCase(), message, user);
	});

	chat.onSub((channel, user, subInfo, msg) => {

		let strippedChannel = channel.substr(1).toLowerCase();
		
		if(subListeners[strippedChannel]) {
			newSubHandler(strippedChannel, subInfo, msg);
		}

		debugLog('------- SUB -------');
		debugLog(subInfo);
		debugLog('-------------------');
	});

	chat.onResub((channel, user, subInfo, msg) => {

		let strippedChannel = channel.substr(1).toLowerCase();
		if(resubListeners[strippedChannel]) {
			resubHandler(strippedChannel, subInfo, msg);
		}

		debugLog('------- RESUB -------');
		debugLog(subInfo);
		debugLog('-------------------');
		
	});

	chat.onCommunitySub((channel, user, subInfo, msg) => {
		debugLog('----- COMMUNITY SUB -----')
		debugLog(subInfo);
		debugLog('---------------------');

		let strippedChannel = channel.substr(1).toLowerCase();
		let totalGifts = subInfo.gifterGiftCount;

		//Get total sub count from here
		if(giftSubListeners[strippedChannel]) {
			giftCommunitySubHandler(strippedChannel, subInfo, msg, totalGifts);
		}
	});

	chat.onCommunityPayForward((channel, user, forwardInfo, msg) => {
		console.log('----- COMMUNITY PAY FORWARD -----');
		console.log(forwardInfo);
		console.log('---------------------');
	});

	chat.onStandardPayForward((channel, user, forwardInfo, msg) => {
		console.log('----- STANDARD PAY FORWARD -----');
		console.log(forwardInfo);
		console.log('---------------------');
	})

	chat.onPrimeCommunityGift((channel, user, subInfo, msg) => {
		console.log('----- PRIME COMMUNITY GIFT -----');
		console.log(subInfo);
		console.log('---------------------');
	});

	chat.onSubExtend((channel, user, subInfo, msg) => {
		console.log('----- SUB EXTEND -----');
		console.log(subInfo);
		console.log('---------------------');
	})

	chat.onSubGift((channel, user, subInfo, msg) => {
		debugLog('------- SUB GIFT -------');
		debugLog(subInfo);
		debugLog('-------------------');

		let strippedChannel = channel.substr(1).toLowerCase();
		let totalGifts = subInfo.gifterGiftCount;

		if(subInfo.gifterGiftCount === 0) {
			//received through sub bomb
			awardRecipient(strippedChannel, subInfo, msg);
		} else if(giftSubListeners[channel]) {
			giftSubHandler(strippedChannel, subInfo, msg, totalGifts);
		}
	});

	chat.onBitsBadgeUpgrade((channel, user, upgradeInfo, msg) => {
		console.log('------- BIT BADGE -------');
		console.log(upgradeInfo);
		console.log('-------------------');
		console.log(msg);
	});

	// chat.onHost((channel, target, viewers) => {
	// 	console.log('------- HOST -------');
	// 	console.log(`${channel} has just hosted ${target}`);
	// 	console.log('-------------------');
	// });

	chat.onDisconnect((manually, error) => {
		console.log('>>> CHATCLIENT DISCONNECTED <<<');
		if(chat.id) {
			console.log(chat.id + ' was disconnected: ' + new Date().toLocaleString());

			handleReconnect(chat.id);
		}
		
		if(manually) {
			console.log('>>> ChatClient was disconnected manually');
		}

		console.log(error);
	});

	let clientID;

	if(forceID) {
		delete clientConnections[forceID];
		clientID = forceID;
	} else {
		clientID = "twitchClient" + Object.keys(clientConnections).length;
	}

	chat.id = clientID;

	clientConnections[clientID] = {
		id: clientID,
		client: chat,
		connections: 0,
		channels: []
	};

	return clientConnections[clientID];
}

let handleReconnect = async (id) => {

	let channels = clientConnections[id].channels;

	let chat = await createClientConnection(id);

	asyncForEach(channels, async (channel) => {
		console.log('> Reconnecting to ' + channel);
		
		let channelName = channel.toLowerCase();

		try {
			connectToStream(channelName, false, chat);
		} catch (error) {
			console.log('error occured reconnecting to ' + channelName);
			console.log(error);
		}
	});
}

let connectToStream = async (channel, old, client) => {
		console.log('connecting to: ' + channel);
		try {

			if(old) {
				channelStatus[channel] = channelStatus[old];
				channelStatus[channel].name = channel;


				delete channelStatus[old];
			}

			let chat;

			if(client) {
				chat = client
			} else {
				let clientIDs = Object.keys(clientConnections);

				for(var i = 0; i < clientIDs.length; i++) {
					if(clientConnections[clientIDs[i]].connections < 15) {
						chat = clientConnections[clientIDs[i]];
						break;
					}
				}

				if(chat === undefined) {
					//no free clients available, create a new one;
					chat = await createClientConnection();
				}
			}

			//TODO: await on this
		
			let state = await chat.client.join(channel);

			console.log('*************************');
			console.log('>>> STREAM ACHIEVEMENTS IS WATCHING ' + channel + ' ON ' + chat.id);

			if(channelStatus[channel].bot) {
				connectToBot(channel, channelStatus[channel].bot, true);
			}
			
			console.log('*************************');

			channelStatus[channel].connected = true;
			chat.connections = chat.connections + 1;
			channelStatus[channel].clientID = chat.id;
			chat.channels.push(channel);
				
		} catch(err) {
			console.log('\x1b[33m%s\x1b[0m', 'issue joining ' + channel + '\'s channel');
			failedToConnect.push(channel);
		}
	}

	let connectToBot = (channel, channelData, startup) => {
		let {st, bot} = channelData;

		let slSocketToken = cryptr.decrypt(st);

		let slSocket = io.connect('https://sockets.streamlabs.com?token=' + slSocketToken, {
			reconnection: true
		});

		let msg = `>>> ${channel} is now connected to ${bot}`

		if(!startup) {
			console.log('**************************');
			console.log(msg);
			console.log('**************************');
		} else {
			console.log(msg);	
		}

		slSocket.SAID = uuid();

		setupSocketEvents(channel, slSocket);

		socketLookup[slSocket.SAID] = channel;

		if(!connectedBots[channel]) {
			connectedBots[channel] = {};
		}

		connectedBots[channel][bot] = slSocket;
	}

	let setupSocketEvents = (channel, socketInstance) => {
		
		socketInstance.on('event', (eventData) => {

			let channel = socketLookup[socketInstance.SAID];

			if(eventData.type === 'donation') {
				
	    		donationHandler(channel, eventData.message)

			} else if(eventData.for === 'twitch_account') {
				switch(eventData.type) {
					case 'follow':
						newFollowHandler(channel, eventData.message);
						break;
					case 'bits':
						bitsHandler(channel, eventData.message);
						break;
					default:
						break;
				}
			}
		});
	};

	

(async () => {

	let irc = await axios.get(process.env.API_DOMAIN + '/api/irc/init');

	let retrieveActiveChannels = async () => {
		let keepGoing = true;
		let offset = 0;
		let total;

		while (keepGoing) {
			let response = await axios.get(process.env.API_DOMAIN + '/api/irc/channels', {
				params: {
					limit: 50,
					offset,
					total
				},
				withCredentials: true
			});

			response.data.channels.forEach(channel => {
				channelStatus[channel.name] = {
					name: channel.name,
					'full-access': channel['full-access'],
					connected: false,
					bot: channel.bot || false
				};
				
			});

			total = response.data.total;

			if(response.data.offset) {
				offset = response.data.offset;
			} else {
				keepGoing = false;

				console.log('> channels retrieved!');

	 			joinChannelsOnStartup();
			}
		}

	}

	let retrieveChannelListeners = async (channels) => {

		let keepGoing = true;
		let offset = 0;
		let total;
		while (keepGoing) {
			let params = {
				limit: 50,
				offset,
				total
			};

			if(channels) {
				params.channels = channels
			};

			let response = await axios.get(process.env.API_DOMAIN + '/api/irc/listeners', {
				params,
				withCredentials: true });
			
			response.data.listeners.forEach((listener) => { listenerHandler(listener, 'add') });
			total = response.data.total;

			if(response.data.offset) {
				offset = response.data.offset;
			} else {
				keepGoing = false;
			}
		}

		console.log("> listeners retrieved");
	}


	let listenerHandler = (listener, method) => {
		let bot;
		let channel = listener.channel;
		let prevBots = listener.prevBots || {};

		delete listener.prevBots;

		try {

			if(method === 'add') {
				switch(listener.achType) {
					case "0":
						//Sub
						subListeners[channel] = subListeners[channel] || [];
						subListeners[channel].push(listener);
						break;

					case "1":
						//Resub
						resubListeners[channel] = resubListeners[channel] || [];
						resubListeners[channel].push(listener);
						break;

					case "2":
						//Gifted Sub
						giftSubListeners[channel] = giftSubListeners[channel] || [];
						giftSubListeners[channel].push(listener);
						break;

					case "3":
						//Raid
						raidListeners[channel] = listener;
						break;

					case "4":
						//Custom
						if(Object.keys(listener.bots).length > 0) {
							let bots = Object.keys(listener.bots);

							bots.forEach((bot, idx) => {
								let listenerObj = {...listener};
								let lowerBot = listener.bots['bot' + idx].toLowerCase();

								chatListeners[channel] = chatListeners[channel] || {};
								chatListeners[channel][lowerBot] = chatListeners[channel][lowerBot] || [];

								let builtQuery = build(listener.queries['query' + idx]);
								listenerObj.query = builtQuery;

								try {
									listenerObj.condition = getCondition(listener.conditions['condition' + idx]);
									chatListeners[channel][lowerBot].push(listenerObj);
								} catch (e) {
									console.log('Issue with loading condition for ' + listener.achievement);
								}
							})
						} else {
							bot = listener.bot.toLowerCase();
							chatListeners[channel] = chatListeners[channel] || {};
							chatListeners[channel][bot] = chatListeners[channel][bot] || [];

							let builtQuery = build(listener.query);
							listener.query = builtQuery;

							//split up conditions
							try {

								listener.condition = getCondition(listener.condition);

								chatListeners[channel][bot].push(listener);
							} catch (e) {
								console.log('Issue with loading condition for ' + listener.achievement);
							}
						}
						
						break;
					case "5":
						//New Follow
						followListeners[channel] = listener;
						//Bot for followage command
						console.log(followListeners[channel]);
						if(listener.bot) {
							bot = listener.bot.toLowerCase();
							chatListeners[channel] = chatListeners[channel] || {};

							chatListeners[channel][bot] = chatListeners[channel][bot] || [];

							let followageQuery = build(listener.query);
							listener.query = followageQuery;

							//split up conditions
							try {
								listener.condition = getCondition(listener.condition);

								chatListeners[channel][bot].push(listener);
								console.log(chatListeners[channel][bot]);
							} catch (e) {
								console.log('Issue with loading condition for ' + listener.achievement);
							}
						}
						break;
					case "6":
						//New Donation
						donationListeners[channel] = listener;
						break;
					case "7":
						//Bits
						bitsListeners[channel] = listener;
						break;
					default:
						break;
				}
			} else if (method === 'update') {
				switch(listener.achType) {
					case "0":
						//Sub
						subListeners[channel] = subListeners[channel] || [];
						if(subListeners[channel].length === 0) {
							subListeners[channel].push(listener);
						} else {
							let idx = subListeners[channel].findIndex(existingListener => {
								return existingListener.achievement === listener.achievement
							});

							subListeners[channel].splice(idx, 1, listener);
						}
						break;

					case "1":
						//Resub
						resubListeners[channel] = resubListeners[channel] || [];
						if(resubListeners[channel].length === 0) {
							resubListeners[channel].push(listener);	
						} else {
							//Search and find previous listener
							let index = resubListeners[channel].findIndex(existingListener => {
								return existingListener.achievement === listener.achievement
							});

							resubListeners[channel].splice(index, 1, listener);
						}
						
						break;

					case "2":
						//Gifted Sub
						giftSubListeners[channel] = giftSubListeners[channel] || [];
						if(giftSubListeners[channel].length === 0) {
							giftSubListeners[channel].push(listener);	
						} else {
							//Search and find previous listener
							let index = giftSubListeners[channel].findIndex(existingListener => {
								return existingListener.achievement === listener.achievement
							});

							giftSubListeners[channel].splice(index, 1, listener);	
						}
						
						break;

					case "3":
						//Raid
						raidListeners[channel] = listener;
						break;

					case "4":
						if(Object.keys(listener.bots).length > 0) {
							let bots = Object.keys(listener.bots);
							let prevBotsArray = Object.keys(prevBots);

							//loop over all listeners and remove the ones associated with the achievement
							//need to know what the previous listener bots were
							prevBotsArray.forEach((bot, idx) => {
								let lowerBot = prevBots["bot" + idx].toLowerCase();
								chatListeners[channel] = chatListeners[channel] || {};
								chatListeners[channel][lowerBot] = chatListeners[channel][lowerBot] || [];

								let index = chatListeners[channel][lowerBot].findIndex(existingListener => {
									return existingListener.achievement === listener.achievement;
								});

								//if found, remove it
								if(index > -1) {
									chatListeners[channel][lowerBot].splice(index, 1);
								}
							});

							//add all listeners coming in from update
							bots.forEach((bot, idx) => {
								let listenerObj = {...listener};
								let lowerBot = listener.bots['bot' + idx].toLowerCase();

								chatListeners[channel] = chatListeners[channel] || {};
								chatListeners[channel][lowerBot] = chatListeners[channel][lowerBot] || [];

								let builtQuery = build(listener.queries['query' + idx]);
								listenerObj.query = builtQuery;

								try {
									listenerObj.condition = getCondition(listener.conditions['condition' + idx]);
									chatListeners[channel][lowerBot].push(listenerObj);
								} catch (e) {
									console.log('Issue with loading condition for ' + listener.achievement);
								}
							})
							
						} else {
							//Custom
							bot = listener.bot.toLowerCase();
							chatListeners[channel] = chatListeners[channel] || {};
							chatListeners[channel][bot] = chatListeners[channel][bot] || [];

							let builtQuery = build(listener.query);
							listener.query = builtQuery;

							try {

								listener.condition = getCondition(listener.condition);

								if(chatListeners[channel][bot].length === 0) {
									chatListeners[channel][bot].push(listener);
								} else {
									let index = chatListeners[channel][bot].findIndex(existingListener => {
										return existingListener.achievement === listener.achievement;
									});
									chatListeners[channel][bot].splice(index, 1, listener);	
								}
							} catch (e) {
								console.log('Issue with loading condition for ' + listener.achievement);
							}
						}
						break;
					case "5":
						//New Follow
						followListeners[channel] = listener;
						break;
					case "6":
						//New Donation
						donationListeners[channel] = listener;
						break;
					case "7":
						//Bits
						bitsListeners[channel] = listener;
						break;
					default:
						break;
				}
			} else if (method === 'remove') {
				switch(listener.achType) {
					case "0":
						//Sub

						if(subListeners[channel] && subListeners[channel].length > 0) {
							//Search and find previous listener
							let index = subListeners[channel].findIndex(existingListener => existingListener.achievement === listener.achievement);

							subListeners[channel].splice(index, 1);
						}

						break;

					case "1":
						//Resub
						query = listener.query;

						if(resubListeners[channel] && resubListeners[channel].length > 0) {
							//Search and find previous listener
							let index = resubListeners[channel].findIndex(existingListener => {
								return existingListener.achievement === listener.achievement
							});

							resubListeners[channel].splice(index, 1);
						}
						
						break;

					case "2":
						//Gifted Sub
						query = listener.query;
						
						if(giftSubListeners[channel] && giftSubListeners[channel].length > 0) {
							//Search and find previous listener
							let index = giftSubListeners[channel].findIndex(existingListener => {
								return existingListener.achievement === listener.achievement
							});

							giftSubListeners[channel].splice(index, 1);
						}
						
						break;

					case "3":
						//Raid
						delete raidListeners[channel];
						break;

					case "4":
						//Custom
						if(Object.keys(listener.bots).length > 0) {
							let bots = Object.keys(listener.bots);

							//loop over all listeners and remove the ones associated with the achievement
							bots.forEach((bot, idx) => {
								let lowerBot = listener.bots["bot" + idx].toLowerCase();
								chatListeners[channel] = chatListeners[channel] || {};
								chatListeners[channel][lowerBot] = chatListeners[channel][lowerBot] || [];

								let index = chatListeners[channel][lowerBot].findIndex(existingListener => {
									return existingListener.achievement === listener.achievement;
								});

								//if found, remove it
								if(index > -1) {
									chatListeners[channel][lowerBot].splice(index, 1);
								}
							});
						} else {
							bot = listener.bot.toLowerCase();
							
							if(chatListeners[channel] & chatListeners[channel][bot] && chatListeners[channel][bot].length > 0) {
								let index = chatListeners[channel][bot].findIndex(existingListener => {
									return existingListener.achievement === listener.achievement
								});

								chatListeners[channel][bot].splice(index, 1);
							}
						}
						break;
					case "5":
						//New Follow
						delete followListeners[channel];
						break;
					case "6":
						//New Donation
						delete donationListeners[channel];
						break;
					case "7":
						//bits
						delete bitsListeners[channel];
						break;
					default:
						break;
				}
			}
		} catch (e) {
			console.log('Error when handling listener');
			console.log('Handle type: ' + method);
			console.log('listener:');
			console.log(listener);
		}
	}

	let setup = () => {
		return new Promise((resolve, reject) => {
	    	socket = io.connect(process.env.SOCKET_DOMAIN, {
	    		reconnection: true
	    	});

	    	socket.emit("handshake", {name: "SAIRC"});

			socket.on("new-channel", (channel) => {
				console.log('-------------------------------');
				console.log('[' + channel.name + '] New channel created!');
				console.log('-------------------------------');
				channelStatus[channel.name] = {
					name: channel.name,
					'full-access': channel['full-access'],
					connected: false
				}
				connectToStream(channel.name);
			});

			//look up chatClient 

			socket.on("channel-update", channelData => {
				console.log('-------------------------------');
				console.log('[' + channelData.old + '] has updated their channel name to ' + channelData.new);
				console.log('-------------------------------');
				if(channelData.old && channelData.new) {
					if(channelStatus[channelData.old] && channelStatus[channelData.old].connected) {
						disconnectFromStream(channelData.old);
					}
					
					channelStatus[channelData.new] = {
						name: channelData.new,
						'full-access': channelData.fullAccess,
						connected: false
					}
					
					connectToStream(channelData.new);

					retrieveChannelListeners([channelData.new]);
				} else {
					console.log('Something went wrong with channel update, check logs');
					console.log(channelData);
				}
			})

			socket.on("new-listener", (listener) => {
				console.log('-------------------------------');
				console.log('[' + listener.channel + '] Adding listener for ' + listener.achievement);
				console.log('-------------------------------');
				listenerHandler(listener, "add");
				console.log(chatListeners['phirehero'])
			});

			socket.on("update-listener", (listener) => {
				console.log('-------------------------------');
				console.log('[' + listener.channel + '] Updating listener for ' + listener.achievement);
				console.log('-------------------------------');
				listenerHandler(listener, "update");
			});

			socket.on("remove-listener", (listener) => {
				console.log('-------------------------------');
				console.log('[' + listener.channel + '] Removing listener for ' + listener.achievement);
				console.log('-------------------------------');
				listenerHandler(listener, "remove");
			});

			socket.on("become-gold", (channel) => {
				console.log('-------------------------------');
				console.log('[' + channel + '] just gained gold status!');
				console.log('-------------------------------');
				if(channelStatus[channel]) {
					channelStatus[channel]['full-access'] = true;
				}
			});

			socket.on("remove-gold", (channel) => {
				console.log('-------------------------------');
				console.log('[' + channel + '] just lost gold status!');
				console.log('-------------------------------');
				if(channelStatus[channel]) {
					channelStatus[channel]['full-access'] = false;
				}
			});

			socket.on("connect-bot", channelData => {
				console.log('-------------------------------');
				console.log('[' + channelData.channel + '] just connected ' + channelData.bot + '!');
				console.log('-------------------------------');
				connectToBot(channelData.channel, channelData);
			});

			socket.on("disconnect-bot", channelData => {
				console.log('-------------------------------');
				console.log('[' + channelData.channel + '] just disconnected ' + channelData.bot + '!');
				console.log('-------------------------------');
				let {channel, bot} = channelData;
				if(connectedBots[channel] && connectedBots[channel][bot]) {
					let channelSocket = connectedBots[channel][bot];
					let sid = channelSocket.id;

					console.log('>>> disconnect-bot: ' + channelData.channel + ": " + channelData.bot);
					channelSocket.close();

					delete connectedBots[channel][bot];
					delete socketLookup[sid];
				}
				
			});

			socket.on("delete-channel", (channel) => {
				if(channelStatus[channel] && channelStatus[channel].connected) {
					disconnectFromStream(channel);
				}
			});

			//look up id and get chatClient from there

			socket.on("achievement-awarded", (achievement) => {
				debugLog(JSON.stringify(achievement));

				try {

					let {channel, message} = achievement;
				
					let clientID = channelStatus[channel].clientID;
					console.log('sending to ' + clientID);
					let chatClient = clientConnections[clientID].client;

					if(process.env.NODE_ENV === 'production') {
						chatClient.say(channel, message);
					} else {
						chatClient.whisper(channel, message);	
					}
				} catch (e) {
					console.log('Error occured in achievement-awarded');
				}
				
			});

			//look up id and get chatClient from there

			socket.on("achievement-awarded-nonMember", (achievement) => {
				debugLog(JSON.stringify(achievement));

				try {
				
					let {channel, message} = achievement;
					
					let clientID = channelStatus[channel].clientID;
					console.log('sending to ' + clientID + ":" + channel);
					let chatClient = clientConnections[clientID].client;

					if(process.env.NODE_ENV === 'production') {
						chatClient.say(channel, message);
					} else {
						chatClient.whisper(channel, message);	
					}
				} catch (e) {
					console.log('Error occured in achievement-awarded-nonMember');
				}
			});

			socket.on("retrieve-listeners", (channel) => {
				let channelListeners = {};

				channelListeners.follow = followListeners[channel];
				channelListeners.donation = donationListeners[channel];
				channelListeners.bits = bitsListeners[channel];
				channelListeners.sub = subListeners[channel];
				channelListeners.resub = resubListeners[channel];
				channelListeners.gift = giftSubListeners[channel];
				channelListeners.raid = raidListeners[channel];
				channelListeners.chat = chatListeners[channel];

				socket.emit('listeners-retrieved', JSON.stringify(channelListeners));
			});

			resolve();
		});
	}

	if(irc.data && irc.data.at && irc.data.rt) {

		IRCAT = cryptr.decrypt(irc.data.at);
		IRCRT = cryptr.decrypt(irc.data.rt);
		IRCEXPIRES = irc.data.expires_in;

		setup().then(() => {
		 	console.log("===========================");
		 	console.log("   IRC IS UP AND RUNNING   ");
		 	console.log("===========================");
		 	console.log("\n");

		 	retrieveActiveChannels();
		 	//Get Listeners for channels
		 	retrieveChannelListeners();

		 	setInterval(sendAchievements, 10000); // Send collected achievements every 10 seconds
		});
	} else {
		console.log('>>> ERROR RETRIEVING IRC DATA FROM SERVER');
	}

	let disconnectFromStream = (channel) => {
		console.log('>>> disconnectFromStream: ' + channel);
				
		let clientID = channelStatus[channel].clientID;
		let chatClient = clientConnections[clientID];

		chatClient.client.part('#' + channel);

		delete followListeners[channel];
		delete donationListeners[channel];
		delete bitsListeners[channel];
		delete subListeners[channel];
		delete resubListeners[channel];
		delete giftSubListeners[channel];
		delete raidListeners[channel];
		delete chatListeners[channel];

		if(connectedBots[channel]) {
			let bots = Object.keys(connectedBots[channel]);

			bots.forEach(bot => {
				let channelSocket = connectedBots[channel][bot];
				let sid = channelSocket.id;

				console.log('>>> closing socket for bot: ' + bot);
		
				channelSocket.close();

				delete connectedBots[channel][bot];
				delete socketLookup[sid];
			});
		}

		delete channelStatus[channel];
		clientConnections[clientID].connections = chatClient.connections - 1;


		console.log('*************************');
		console.log(`>>> ${channel} has deleted their channel!`);
		console.log('*************************');
	}



	let joinChannelsOnStartup = async () => {
		let channelNames = Object.keys(channelStatus);

		console.log(channelNames);

		if(channelNames.length > 0) {
			asyncForEach(channelNames, async (channel) => {
				let channelName = channel.toLowerCase();
				await connectToStream(channelName);
			});
		}

		setTimeout(() => {
			if(failedToConnect.length > 0) {
				axios({
					method: 'post',
					url: process.env.API_DOMAIN + '/api/channel/update',
					data: failedToConnect
				}).then(res => {
					if(res.data.updatedChannels) {
						res.data.updatedChannels.forEach(channel => {
							let channelName = channel.new.toLowerCase();
							connectToStream(channelName, channel.old);
						});

						retrieveChannelListeners(res.data.updatedChannels.map(channel => channel.new));
					}
				})
			}
		}, 20000)

		let retry = failedToConnect.length > 0;

		while(retry) {
			let retries = failedToConnect.splice(0, failedToConnect.length);

			setTimeout(() => {
				retries.forEach(connectToStream);
			}, 5000);

			retry = failedToConnect.length > 0;
		}
	}

	let sendAchievements = () => {
		console.log(requestQueue);
		if(requestQueue.length > 0) {
			//We have achievements to send
			let achievements = requestQueue.slice(0); //Make copy to only process up to this point
			requestQueue.splice(0,requestQueue.length); //clear out queue
			
			console.log('\nSending ' + achievements.length + ' achievements...');

			axios({
				method: 'post',
				url: process.env.API_DOMAIN + '/api/achievement/listeners',
				data: achievements
			});
		}
	}

		// let pubsub = () => {
		// 	axios({
		// 		method: 'post',
		// 		url: 'https://api.twitch.tv/helix/webhooks/hub',
		// 		headers: {'client-ID': client_id},
		// 		data: {
		// 			'hub.callback': 'http://localhost:5000/api/achievement/listeners',
		// 			'hub.mode': 'subscribe',
		// 			'hub.topic': 'https://api.twitch.tv/helix/users/follows?first=1&to_id=56453119',
		// 			'hub.lease_seconds': 6000
		// 		}
		// 	}).then(response => {
		// 		console.log(response);
		// 	}).catch(error => {
		// 		console.log(error);
		// 	});
		// }

		//pubsub();
})();

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}