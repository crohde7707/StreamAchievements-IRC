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
let channelLookup = {};

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
let newSubHandler = (cid, subInfo, msg) => {

	let {userId} = subInfo;
	let plan;

	if(subInfo.plan === "PRIME") {
		plan = '1000';
	} else {
		plan = subInfo.plan;
	}

	if(subListeners[cid]) {
		subListeners[cid].forEach(listener => {

			if(listener.condition === plan) {
				let achievementRequest = {
					cid,
					achievementID: listener.achievement,
					tier: plan,
					userID: userId
				};

				requestQueue.push(achievementRequest);
			}
		});
	}
};

let newFollowHandler = (cid, msg) => {
	if(followListeners[cid]) {
		let achievementRequest = {
			cid,
			achievementID: followListeners[cid].achievement,
			userID: msg[0].id,
			user: msg[0].name
		}

		requestQueue.push(achievementRequest);
	}
}

let donationHandler = (cid, msg) => {
	if(donationListeners[cid]) {
		let achievementRequest = {
			cid,
			achievementID: donationListeners[cid].achievement,
			user: msg[0].name,
			amount: msg[0].amount
		}

		requestQueue.push(achievementRequest);
	}
}

let bitsHandler = (cid, msg) => {
	if(bitsListeners[cid]) {
		let achievementRequest = {
			cid,
			achievementID: bitsListeners[cid].achievement,
			user: msg[0].name
		}

		requestQueue.push(achievementRequest);
	}
}

let resubHandler = (cid, subInfo, msg) => {
	let {months, streak, plan, userId} = subInfo;
	
	let largestListener;

	if(resubListeners[cid]) {
		resubListeners[cid].forEach((listener) => {	
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
				cid,
				type: 'resub',
				tier: plan,
				userID: userId,
				achievementID: largestListener.achievement,
				cumulative: months
			};

			debugLog('Resub Achievement');
			debugLog(JSON.stringify(achievementRequest));

			requestQueue.push(achievementRequest);
		}
	} else if(subListeners[cid]) {
		newSubHandler(cid, subInfo, msg);
	}
};

let giftCommunitySubHandler = (cid, subInfo, msg, totalGifts) => {
	let achievementListeners = giftSubListeners[cid];
	let {plan, gifterUserId} = subInfo;
	let msgId = msg.tags.get('msg-id');

	achievementListeners.forEach(listener => {
		if(listener.condition <= totalGifts) {
			let achievementRequest = {
	            cid,
	            achievementID: listener.achievement, //Stream Acheivements achievement
	            type: msgId, //type of event (sub, resub, subgift, resub)
	            userID: gifterUserId, //Person giving the sub
	            tier: plan, // (PRIME, 1000, 2000, 3000)
	        }

	        debugLog('Community Sub Achievement');
	        debugLog(JSON.stringify(achievementRequest));

	        requestQueue.push(achievementRequest);			
		}
	})
}

let giftSubHandler = (cid, subInfo, msg, totalGifts) => {

	let achievementListeners = giftSubListeners[cid];
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
	            cid,
	            achievementID: listener.achievement, //Stream Acheivements achievement
	            type: 'subgift', //type of event (sub, resub, subgift, resub)
	            userID: gifterUserId, //Person giving the sub
	            tier: plan, // (PRIME, 1000, 2000, 3000)
	        }

			debugLog('Gift Sub Achievement');
	        debugLog(JSON.stringify(achievementRequest));

        	requestQueue.push(achievementRequest);
        }
    });

	awardRecipient(cid, subInfo, msg);
	
};

let awardRecipient = (cid, subInfo, msg) => {
		
	let {userId} = subInfo;
	let months, plan;

	if(plan === "PRIME") {
		plan = '1000';
	} else {
		plan = subInfo.plan;
	}

	try {
		months = Number.parseInt(subInfo.months);
	} catch (e) {
		console.log('months could not parse into an integer');
	}

	if(months) {
		if(months > 1) {
	        console.log("got some resub listeners, check them...");
			if(resubListeners[cid]) {

				let largestListener;
	            
				resubListeners[cid].forEach((listener) => {	
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
						cid,
						type: 'resub',
						tier: plan,
						userID: userId,
						achievementID: largestListener.achievement,
						cumulative: months
					};

					debugLog('Award Recipient of Gift Achievement');
	        		debugLog(JSON.stringify(achievementRequest));

					requestQueue.push(achievementRequest);
				}
			}
		} else if(months === 1) {
			
			if(subListeners[cid]) {
				subListeners[cid].forEach(listener => {
					if(listener.condition === plan) {
						let achievementRequest = {
							cid,
							achievementID: listener.achievement,
							tier: plan,
							userID: userId
						};

						requestQueue.push(achievementRequest);
					}
				});
			}
		}
	}
}

let getAllowedListeners = (listeners) => {
	let allowedListeners = [];

	allowedListeners = listeners.filter(listener => {
		return listener.unlocked || listener.achType === "5"
	});

	return allowedListeners;
}

let chatHandler = (cid, msg, username) => {

	if(channelStatus[cid] && chatListeners[cid]) {

		let listeners = chatListeners[cid][username];
		if(listeners) {

			if(!channelStatus[cid]['full-access']) {
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
								cid,
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
											cid,
											achievementID: listener.achievement,
											user
										}

										console.log(achievementRequest);

										requestQueue.push(achievementRequest);
									}
								} catch(e) {
									console.log(e);
									console.log("*******************************");
									console.log("Error parsing chat listener");
									console.log("Channel: " + cid);
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
		let strippedChannel = channel.substr(1).toLowerCase();
		let cid = channelLookup[strippedChannel];

		chatHandler(cid, message, user);
	});

	chat.onAction((channel, user, message) => {
		let strippedChannel = channel.substr(1).toLowerCase();
		let cid = channelLookup[strippedChannel];
		
		chatHandler(cid, message, user);
	});

	chat.onSub((channel, user, subInfo, msg) => {

		let strippedChannel = channel.substr(1).toLowerCase();
		let cid = channelLookup[strippedChannel];
		
		if(subListeners[cid]) {
			newSubHandler(cid, subInfo, msg);
		}

		debugLog('------- SUB -------');
		debugLog(subInfo);
		debugLog('-------------------');
	});

	chat.onResub((channel, user, subInfo, msg) => {

		let strippedChannel = channel.substr(1).toLowerCase();
		let cid = channelLookup[strippedChannel];

		if(resubListeners[cid]) {
			resubHandler(cid, subInfo, msg);
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
		let cid = channelLookup[strippedChannel];
		let totalGifts = subInfo.gifterGiftCount;

		//Get total sub count from here
		if(giftSubListeners[cid]) {
			giftCommunitySubHandler(cid, subInfo, msg, totalGifts);
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
		let cid = channelLookup[strippedChannel];
		let totalGifts = subInfo.gifterGiftCount;

		if(subInfo.gifterGiftCount === 0) {
			//received through sub bomb
			awardRecipient(cid, subInfo, msg);
		} else if(giftSubListeners[cid]) {
			giftSubHandler(cid, subInfo, msg, totalGifts);
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

	asyncForEach(channels, async (cid) => {
		console.log('> Reconnecting to ' + cid);

		try {
			connectToStream(cid, chat);
		} catch (error) {
			console.log('error occured reconnecting to ' + cid);
			console.log(error);
		}
	});
}

let connectToStream = async (cid, client, updateName) => {

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

		try {
			if(updateName) {
				channelStatus[cid].name = updateName.new;
			}
			
			let channelName = channelStatus[cid].name;

			let state = await chat.client.join(channelName);

			console.log('*************************');
			console.log('>>> STREAM ACHIEVEMENTS IS WATCHING ' + channelName + ' ON ' + chat.id);

			if(channelStatus[cid].streamlabs) {
				connectToStreamlabs(channelStatus[cid], true);
			}
			
			console.log('*************************');

			channelStatus[cid].connected = true;
			chat.connections = chat.connections + 1;
			channelStatus[cid].clientID = chat.id;
			chat.channels.push(cid);

			channelLookup[channelName] = cid;
				
		} catch(err) {
			console.log('\x1b[33m%s\x1b[0m', 'issue joining ' + channelStatus[cid].name + '\'s channel');
			failedToConnect.push(cid);
		}
	}

	let connectToStreamlabs = (channelData, startup) => {
		let {name, cid} = channelData;
		let {st} = channelData.streamlabs;

		let slSocketToken = cryptr.decrypt(st);

		let slSocket = io.connect('https://sockets.streamlabs.com?token=' + slSocketToken, {
			reconnection: true
		});

		let msg = `>>> ${name} is now connected to Streamlabs`

		if(!startup) {
			console.log('*************************');
			console.log(msg);
			console.log('*************************');
		} else {
			console.log(msg);	
		}

		slSocket.SAID = uuid();

		setupStreamlabsEvents(slSocket);

		socketLookup[slSocket.SAID] = cid;

		if(!connectedBots[cid]) {
			connectedBots[cid] = {};
		}

		connectedBots[cid]['streamlabs'] = slSocket;
	}

	let setupStreamlabsEvents = (socketInstance) => {
		
		socketInstance.on('event', (eventData) => {

			let cid = socketLookup[socketInstance.SAID];

			if(eventData.type === 'donation') {
				
	    		donationHandler(cid, eventData.message)

			} else if(eventData.for === 'twitch_account') {
				switch(eventData.type) {
					case 'follow':
						newFollowHandler(cid, eventData.message);
						break;
					case 'bits':
						bitsHandler(cid, eventData.message);
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
				let {name, cid, tid} = channel;

				channelStatus[cid] = {
					name: name,
					cid: cid,
					tid: tid,
					'full-access': channel['full-access'],
					connected: false
				};

				if(channel.streamlabs) {
					channelStatus[cid].streamlabs = channel.streamlabs;
				}
				
				if(channel.streamelements) {
					channelStatus[cid].streamelements = channel.streamelements;
				}
				
			});

			total = response.data.total;

			if(response.data.offset) {
				offset = response.data.offset;
			} else {
				keepGoing = false;

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
		let cid = listener.cid;

		if(method === 'add') {
			switch(listener.achType) {
				case "0":
					//Sub
					subListeners[cid] = subListeners[cid] || [];
					subListeners[cid].push(listener);
					break;

				case "1":
					//Resub
					resubListeners[cid] = resubListeners[cid] || [];
					resubListeners[cid].push(listener);
					break;

				case "2":
					//Gifted Sub
					giftSubListeners[cid] = giftSubListeners[cid] || [];
					giftSubListeners[cid].push(listener);
					break;

				case "3":
					//Raid
					raidListeners[cid] = listener;
					break;

				case "4":
					//Custom
					bot = listener.bot.toLowerCase();
					chatListeners[cid] = chatListeners[cid] || {};
					chatListeners[cid][bot] = chatListeners[cid][bot] || [];

					let builtQuery = build(listener.query);
					listener.query = builtQuery;

					//split up conditions
					try {
						listener.condition = getCondition(listener.condition);

						chatListeners[cid][bot].push(listener);
					} catch (e) {
						console.log('Issue with loading condition for ' + listener.achievement);
					}
					
					break;
				case "5":
					//New Follow
					followListeners[cid] = listener;
					//Bot for followage command
					if(listener.bot) {
						bot = listener.bot.toLowerCase();
						chatListeners[cid] = chatListeners[cid] || {};

						chatListeners[cid][bot] = chatListeners[cid][bot] || [];

						let followageQuery = build(listener.query);
						listener.query = followageQuery;

						//split up conditions
						try {
							listener.condition = getCondition(listener.condition);

							chatListeners[cid][bot].push(listener);
						} catch (e) {
							console.log('Issue with loading condition for ' + listener.achievement);
						}
					}
					break;
				case "6":
					//New Donation
					donationListeners[cid] = listener;
					break;
				case "7":
					//Bits
					bitsListeners[cid] = listener;
					break;
				default:
					break;
			}
		} else if (method === 'update') {
			switch(listener.achType) {
				case "0":
					//Sub
					subListeners[cid] = subListeners[cid] || [];
					if(subListeners[cid].length === 0) {
						subListeners[cid].push(listener);
					} else {
						let idx = subListeners[cid].findIndex(existingListener => {
							return existingListener.achievement === listener.achievement
						});

						subListeners[cid].splice(idx, 1, listener);
					}
					break;

				case "1":
					//Resub
					resubListeners[cid] = resubListeners[cid] || [];
					if(resubListeners[cid].length === 0) {
						resubListeners[cid].push(listener);	
					} else {
						//Search and find previous listener
						let index = resubListeners[cid].findIndex(existingListener => {
							return existingListener.achievement === listener.achievement
						});

						resubListeners[cid].splice(index, 1, listener);
					}
					
					break;

				case "2":
					//Gifted Sub
					giftSubListeners[cid] = giftSubListeners[cid] || [];
					if(giftSubListeners[cid].length === 0) {
						giftSubListeners[cid].push(listener);	
					} else {
						//Search and find previous listener
						let index = giftSubListeners[cid].findIndex(existingListener => {
							return existingListener.achievement === listener.achievement
						});

						giftSubListeners[cid].splice(index, 1, listener);	
					}
					
					break;

				case "3":
					//Raid
					raidListeners[cid] = listener;
					break;

				case "4":
					//Custom
					bot = listener.bot.toLowerCase();
					chatListeners[cid] = chatListeners[cid] || {};
					chatListeners[cid][bot] = chatListeners[cid][bot] || [];

					let builtQuery = build(listener.query);
					listener.query = builtQuery;

					try {

						listener.condition = getCondition(listener.condition);

						if(chatListeners[cid][bot].length === 0) {
							chatListeners[cid][bot].push(listener);
						} else {
							let index = chatListeners[cid][bot].findIndex(existingListener => {
								return existingListener.achievement === listener.achievement;
							});
							chatListeners[cid][bot].splice(index, 1, listener);	
						}
					} catch (e) {
						console.log('Issue with loading condition for ' + listener.achievement);
					}
					break;
				case "5":
					//New Follow
					followListeners[cid] = listener;
					break;
				case "6":
					//New Donation
					donationListeners[cid] = listener;
					break;
				case "7":
					//Bits
					bitsListeners[cid] = listener;
					break;
				default:
					break;
			}
		} else if (method === 'remove') {
			switch(listener.achType) {
				case "0":
					//Sub

					if(subListeners[cid] && subListeners[cid].length > 0) {
						//Search and find previous listener
						let index = subListeners[cid].findIndex(existingListener => existingListener.achievement === listener.achievement);

						subListeners[cid].splice(index, 1);
					}

					break;

				case "1":
					//Resub
					query = listener.query;

					if(resubListeners[cid] && resubListeners[cid].length > 0) {
						//Search and find previous listener
						let index = resubListeners[cid].findIndex(existingListener => {
							return existingListener.achievement === listener.achievement
						});

						resubListeners[cid].splice(index, 1);
					}
					
					break;

				case "2":
					//Gifted Sub
					query = listener.query;
					
					if(giftSubListeners[cid] && giftSubListeners[cid].length > 0) {
						//Search and find previous listener
						let index = giftSubListeners[cid].findIndex(existingListener => {
							return existingListener.achievement === listener.achievement
						});

						giftSubListeners[cid].splice(index, 1);
					}
					
					break;

				case "3":
					//Raid
					delete raidListeners[cid];
					break;

				case "4":
					//Custom
					bot = listener.bot.toLowerCase();
					
					if(chatListeners[cid] & chatListeners[cid][bot] && chatListeners[cid][bot].length > 0) {
						let index = chatListeners[cid][bot].findIndex(existingListener => {
							return existingListener.achievement === listener.achievement
						});

						chatListeners[cid][bot].splice(index, 1);
					}
					break;
				case "5":
					//New Follow
					delete followListeners[cid];
					break;
				case "6":
					//New Donation
					delete donationListeners[cid];
					break;
				case "7":
					//bits
					delete bitsListeners[cid];
					break;
				default:
					break;
			}
		}
	}

	let setup = () => {
		return new Promise((resolve, reject) => {
	    	socket = io.connect(process.env.SOCKET_DOMAIN, {
	    		reconnection: true
	    	});

	    	socket.emit("handshake", {name: "SAIRC"});

			socket.on("new-channel", (channelData) => {
				let {name, cid, tid} = channelData;
				console.log('-------------------------------');
				console.log('[' + name + '] New channel created!');
				console.log('-------------------------------');
				channelStatus[cid] = {
					id: cid,
					name: name,
					tid: tid,
					'full-access': channelData['full-access'],
					connected: false
				}

				connectToStream(cid);
			});

			//look up chatClient 

			socket.on("channel-update", channelData => {
				let {oldName, newName, cid, tid, fullAccess} = channelData
				console.log('-------------------------------');
				console.log('[' + oldName + '] has updated their channel name to ' + newName);
				console.log('-------------------------------');

				if(oldName && newName && cid) {
					if(channelStatus[cid] && channelStatus[cid].connected) {
						disconnectFromStream(oldName);
					}
					
					channelStatus[cid] = {
						id: cid,
						name: newName,
						tid: tid,
						'full-access': fullAccess,
						connected: false
					}
					
					connectToStream(cid);

					retrieveChannelListeners([cid]);
				} else {
					console.log('Something went wrong with channel update, check logs');
					console.log(channelData);
				}
			})

			socket.on("new-listener", (listener) => {
				listenerHandler(listener, "add");
			});

			socket.on("update-listener", (listener) => {
				listenerHandler(listener, "update");
			});

			socket.on("remove-listener", (listener) => {
				listenerHandler(listener, "remove");
			});

			socket.on("become-gold", (cid) => {
				if(channelStatus[cid]) {
					channelStatus[cid]['full-access'] = true;
					console.log('-------------------------------');
					console.log('[' + channelStatus[cid].name + '] just gained gold status!');
					console.log('-------------------------------');
				}
			});

			socket.on("remove-gold", (cid) => {
				if(channelStatus[cid]) {
					channelStatus[cid]['full-access'] = false;
					console.log('-------------------------------');
					console.log('[' + channelStatus[cid].name + '] just lost gold status!');
					console.log('-------------------------------');
				}				
			});

			socket.on("connect-bot", channelData => {
				console.log('-------------------------------');
				console.log('[' + channelData.cid + '] just connected ' + channelData.bot + '!');
				console.log('-------------------------------');

				if(bot === 'streamlabs') {
					connectToStreamlabs(channelData);
				} else if(bot === 'streamelements') {
					//connectToStreamElements(channelData);
				}
			});

			socket.on("disconnect-bot", channelData => {
				console.log('-------------------------------');
				console.log('[' + channelData.cid + '] just disconnected ' + channelData.bot + '!');
				console.log('-------------------------------');

				let {cid, bot} = channelData;

				if(connectedBots[cid] && connectedBots[cid][bot]) {
					let channelSocket = connectedBots[cid][bot];
					let sid = channelSocket.id;

					console.log('>>> disconnect-bot: ' + channelData.cid + ": " + channelData.bot);
					channelSocket.close();

					delete connectedBots[cid][bot];
					delete socketLookup[sid];
				}
				
			});

			socket.on("delete-channel", (cid) => {
				if(channelStatus[cid] && channelStatus[cid].connected) {
					disconnectFromStream(cid);
				}
			});

			//look up id and get chatClient from there

			socket.on("achievement-awarded", (achievement) => {
				debugLog(JSON.stringify(achievement));
				
				let {cid, message} = achievement;
				let {name} = channelStatus[cid];
				
				let clientID = channelStatus[cid].clientID;

				let chatClient = clientConnections[clientID].client;

				if(process.env.NODE_ENV === 'production') {
					chatClient.say(name, message);
				} else {
					console.log(name);
					console.log(message);
					chatClient.say(name, message);	
				}
				
			});

			//look up id and get chatClient from there

			socket.on("achievement-awarded-nonMember", (achievement) => {
				debugLog(JSON.stringify(achievement));
				
				let {cid, message} = achievement;
				let {name} = channelStatus[cid];
				
				let clientID = channelStatus[cid].clientID;

				let chatClient = clientConnections[cid].client;

				if(process.env.NODE_ENV === 'production') {
					chatClient.say(name, message);
				} else {
					chatClient.whisper(name, message);	
				}
			});

			socket.on("retrieve-listeners", (cid) => {
				let channelListeners = {};

				channelListeners.follow = followListeners[cid];
				channelListeners.donation = donationListeners[cid];
				channelListeners.bits = bitsListeners[cid];
				channelListeners.sub = subListeners[cid];
				channelListeners.resub = resubListeners[cid];
				channelListeners.gift = giftSubListeners[cid];
				channelListeners.raid = raidListeners[cid];
				channelListeners.chat = chatListeners[cid];

				socket.emit('listeners-retrieved', JSON.stringify(channelListeners));
			});

			socket.on("test", (testData) => {
				let {cid, type} = testData;

				switch(type) {
					case 'follow':
						console.log('hello');
						newFollowHandler(cid, [{
							id: "448669568",
							name: 'phiretest'
						}]);
						break;
					case 'donation':
						donationHandler(cid, [{
							name: 'phiretest',
							amount: '5.00'
						}]);
						break;
					case 'bits':
						bitsHandler(cid, [{
							name: 'phiretest'
						}]);
						break;
					case 'subprime':
						newSubHandler(cid, {
							plan: 'PRIME',
							userId: '448669568'
						});
						break;
					case 'subtier1':
						newSubHandler(cid, {
							plan: '1000',
							userId: '448669568'
						});
						break;
					case 'subtier2':
						newSubHandler(cid, {
							plan: '2000',
							userId: '448669568'
						});
						break;
					case 'subtier3':
						newSubHandler(cid, {
							plan: '3000',
							userId: '448669568'
						});
						break;
					case 'resub':
						resubHandler(cid, {
							months: 6, 
							plan: 1000,
							userId: '448669568'
						})
						break;
					case 'giftsub':
						giftSubHandler(cid, {
							months: 6,
							plan: 1000,
							gifterUserId: '448669568',
							userId: '173264905' //phirebot
						}, {}, 5);
						break;
					case 'custom':
						console.log(cid, testData.bot, testData.message);
						chatHandler(cid, testData.message, testData.bot);
						break;
					default:
						break;
				}
			})

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

	let disconnectFromStream = (channelID) => {
		console.log('>>> disconnectFromStream: ' + channelID);
				
		let clientID = channelStatus[channelID].clientID;
		let chatClient = clientConnections[clientID];
		let channelName = channelStatus[channelID].name;

		chatClient.client.part('#' + channelName);

		delete followListeners[channelID];
		delete donationListeners[channelID];
		delete bitsListeners[channelID];
		delete subListeners[channelID];
		delete resubListeners[channelID];
		delete giftSubListeners[channelID];
		delete raidListeners[channelID];
		delete chatListeners[channelID];

		if(connectedBots[channelID]) {
			let bots = Object.keys(connectedBots[channelID]);

			bots.forEach(bot => {
				let channelSocket = connectedBots[channelID][bot];
				let sid = channelSocket.id;

				console.log('>>> closing socket for bot: ' + bot);
		
				channelSocket.close();

				delete connectedBots[channelID][bot];
				delete socketLookup[sid];
			});
		}

		delete channelStatus[channelID];
		clientConnections[clientID].connections = chatClient.connections - 1;


		console.log('*************************');
		console.log(`>>> ${channelName} has deleted their channel!`);
		console.log('*************************');
	}



	let joinChannelsOnStartup = async () => {
		let channelIDs = Object.keys(channelStatus);
		
		if(channelIDs.length > 0) {
			asyncForEach(channelIDs, async (channelID) => {
				await connectToStream(channelID);
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
						asyncForEach(res.data.updatedChannels, async(channel) => {
							await connectToStream(channel.cid, null, {
								old: channel.old,
								new: channel.new
							});
						});

						retrieveChannelListeners(res.data.updatedChannels);
					}
				})
			}
		}, 20000)

		let retry = failedToConnect.length > 0;

		while(retry) {
			let retries = failedToConnect.splice(0, failedToConnect.length);

			setTimeout(() => {
				asyncForEach(retries, connectToStream);
			}, 5000);

			retry = failedToConnect.length > 0;
		} //Check
	}

	let sendAchievements = () => {
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

})();

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}