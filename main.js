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

let socket, twitchClient, chat;

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

let requestQueue = [];
let failedToConnect = [];

let DEBUG_ENABLED = false;

let debugLog = (msg) => {
	if(DEBUG_ENABLED || process.env.DEBUG_ENABLED) {
		console.log('(i) ' + msg);
	}
}

// Achievement Handlers
let newSubHandler = (channel, subInfo, msg) => {

	let {plan} = subInfo;
	let userId = msg.tags.get('user-id');

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
	let {months, streak, plan} = subInfo;
	let msgId = msg.tags.get('msg-id');
	let userId = msg.tags.get('user-id');
	
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
				'type': msgId,
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
	let {plan} = subInfo;
	let msgId = msg.tags.get('msg-id');
	let userId = msg.tags.get('user-id');

	achievementListeners.forEach(listener => {
		if(listener.condition <= totalGifts) {
			let achievementRequest = {
	            'channel': channel,
	            'achievementID': listener.achievement, //Stream Acheivements achievement
	            'type': msgId, //type of event (sub, resub, subgift, resub)
	            'userID': userId, //Person giving the sub
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
	let {months, plan} = subInfo;
	let msgId = msg.tags.get('msg-id');
	let userId = msg.tags.get('user-id');

	achievementListeners.forEach(listener => {
		if(listener.condition <= totalGifts) {

	        let achievementRequest = {
	            'channel': channel,
	            'achievementID': listener.achievement, //Stream Acheivements achievement
	            'type': msgId, //type of event (sub, resub, subgift, resub)
	            'userID': userId, //Person giving the sub
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
	if(msg !== undefined) {
		
		let {months, plan} = subInfo;
		let msgId = msg.tags.get('msg-id');
		let recipientId = msg.tags.get('msg-param-recipient-id');

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
						'userID': recipientId,
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
				let newSubRequest = {
					'channel': channel,
					'achievementID': subListeners[channel].achievement,
					'tier': plan,
					'userID': recipientId
				};

				requestQueue.push(newSubRequest);
			}
		}	
	} else {
		console.log('msg isn\'t defined');
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

let chatHandler = (channel, msg, username) => {

	if(channelStatus[channel] && chatListeners[channel]) {

		let listeners = chatListeners[channel][username];
		if(listeners) {

			if(!channelStatus[channel]['full-access']) {
				listeners = [listeners[0]];
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

										debugLog('Time based achievement for ' + channel + ': ' + user);
										debugLog('desiredTime: ' + desiredTime);
										debugLog('solutionTime: ' + solutionTime);
										debugLog(eval(desiredTime + operator + solutionTime));

										award = eval(desiredTime + operator + solutionTime);

									} else if(isNaN(parseFloat(solution))) {
										//checking for string
										if(operator === '===') {
											award = desired === solution;
										}
									} else {
										award = eval(desired + operator + solution);
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

(async () => {

	let irc = await axios.get(process.env.API_DOMAIN + '/api/irc/init');

	if(irc.data && irc.data.at && irc.data.rt) {

		let at = cryptr.decrypt(irc.data.at);
		let rt = cryptr.decrypt(irc.data.rt);
		let expires_in = irc.data.expires_in;

		twitchClient = await TwitchClient.withCredentials(process.env.IRCCID, at, undefined, {
			clientSecret: process.env.IRCCS,
			refreshToken: rt,
			expiry: new Date(expires_in) || 0,
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

		chat = await ChatClient.forTwitchClient(twitchClient);

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

			console.log('------- SUB -------');
			console.log(subInfo);
			console.log('-------------------');
		});

		chat.onResub((channel, user, subInfo, msg) => {

			let strippedChannel = channel.substr(1).toLowerCase();
			if(resubListeners[strippedChannel]) {
				resubHandler(strippedChannel, subInfo, msg);
			}

			console.log('------- RESUB -------');
			console.log(subInfo);
			console.log('-------------------');
			
		});

		chat.onCommunitySub((channel, user, subInfo, msg) => {
			console.log('----- COMMUNITY SUB -----')
			console.log(subInfo);
			console.log('---------------------')

			let strippedChannel = channel.substr(1).toLowerCase();
			let totalGifts = subInfo.gifterGiftCount;

			//Get total sub count from here
			if(giftSubListeners[strippedChannel]) {
				giftCommunitySubHandler(strippedChannel, subInfo, msg, totalGifts);
			}
		});

		chat.onSubGift((channel, user, subInfo, msg) => {
			console.log('------- SUB GIFT -------');
			console.log(subInfo);
			console.log('-------------------');

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

		 			joinChannelsOnStartup();
				}
			}
		}

		let retrieveChannelListeners = async () => {

			let keepGoing = true;
			let offset = 0;
			let total;
			while (keepGoing) {
				let response = await axios.get(process.env.API_DOMAIN + '/api/irc/listeners', {
					params: {
						limit: 50,
						offset,
						total
					},
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
			} else if (method === 'update') {
				switch(listener.achType) {
					case "0":
						//Sub
						subListeners[channel] = subListeners[channel] || [];
						if(subListeners[channel].length === 0) {
							subListeners[channel].push(listener);
						} else {
							let idx = subListeners[channel].findIndex(existingListener => existingListener.id === listener.id);

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
								existingListener.id === listener.id
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
								existingListener.id === listener.id
							});

							giftSubListeners[channel].splice(index, 1, listener);	
						}
						
						break;

					case "3":
						//Raid
						raidListeners[channel] = listener;
						break;

					case "4":
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
									existingListener.id === listener.id
								});

								chatListeners[channel][bot].splice(index, 1, listener);	
							}
						} catch (e) {
							console.log('Issue with loading condition for ' + listener.achievement);
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
							let index = subListeners[channel].findIndex(existingListener => existingListener.id === listener.id);

							subListeners[channel].splice(index, 1);
						}

						break;

					case "1":
						//Resub
						query = listener.query;

						if(resubListeners[channel] && resubListeners[channel].length > 0) {
							//Search and find previous listener
							let index = resubListeners[channel].findIndex(existingListener => {
								existingListener.id === listener.id
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
								existingListener.id === listener.id
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
						bot = listener.bot.toLowerCase();
						
						if(chatListeners[channel] & chatListeners[channel][bot] && chatListeners[channel][bot].length > 0) {
							let index = chatListeners[channel][bot].findIndex(existingListener => {
								existingListener.id === listener.id
							});

							chatListeners[channel][bot].splice(index, 1);
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

				socket.on("channel-update", channelData => {
					console.log('-------------------------------');
					console.log('[' + channelData.old + '] has updated their channel name to ' + channelData.new);
					console.log('-------------------------------');

					disconnectFromStream(channelData.old);
					
					let fullAccess = channelStatus[channelData.old];

					delete channelStatus[channelData.old];
					
					channelStatus[channelData.new] = {
						name: channelData.new,
						'full-access': fullAccess,
						connected: false
					}
					
					connectToStream(channelData.new);
					
				})

				socket.on("new-listener", (listener) => {
					console.log('-------------------------------');
					console.log('[' + listener.channel + '] Adding listener for ' + listener.achievement);
					console.log('-------------------------------');
					listenerHandler(listener, "add");
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

						channelSocket.close();

						delete connectedBots[channel][bot];
						delete socketLookup[sid];
					}
					
				});

				socket.on("delete-channel", (channel) => {
					disconnectFromStream(channel);
				});

				socket.on("test", (eventData) => {

				});

				socket.on("achievement-awarded", (achievement) => {
					debugLog(JSON.stringify(achievement));
					if(process.env.NODE_ENV === 'production') {
						chat.say(achievement.channel, achievement.message);
					} else {
						chat.whisper(achievement.channel, achievement.message);	
					}
					
				});

				socket.on("achievement-awarded-nonMember", (achievement) => {
					debugLog(JSON.stringify(achievement));
					if(process.env.NODE_ENV === 'production') {
						chat.say(achievement.channel, achievement.message);
					} else {
						chat.whisper(achievement.channel, achievement.message);	
					}
				});

				resolve();
			});
		}

		 setup().then(() => {
		 	console.log("===========================");
		 	console.log("   IRC IS UP AND RUNNING   ");
		 	console.log("===========================");
		 	console.log("\n");

		 	retrieveActiveChannels();
		 	//Get Listeners for channels
		 	retrieveChannelListeners();

			    //TODO: Pull back bot tokens with channel grabs, connect to sockets and store reference

		    		/*
						{ type: 'follow',
						  for: 'twitch_account',
						  message:
						   [ { _id: 'cdf271793355b2c542b2bcbb32c35ba7',
						       id: '462302230',
						       name: 'arda_celikkanat',
						       priority: 10 } ],
						  event_id: 'evt_5ed407e33bf25ba5d4a1d96ffcd034de' }

						  { type: 'host',
							  message:
							   [ { name: 'ladyjac',
							       viewers: 1,
							       type: 'manual',
							       _id: '36ffe37978c911946524cf845a4845d6',
							       event_id: '36ffe37978c911946524cf845a4845d6' } ],
							  for: 'twitch_account' }

						{ type: 'donation',
						  message:
						   [ { id: 122741831,
						       name: 'phirehero',
						       amount: 1,
						       formatted_amount: '$1.00',
						       formattedAmount: '$1.00',
						       message: '',
						       currency: 'USD',
						       emotes: '',
						       iconClassName: 'fas fa-credit-card',
						       to: [Object],
						       from: 'phirehero',
						       from_user_id: 4441934,
						       donation_currency: 'USD',
						       source: 'stripe',
						       _id: '48f52424e659ad4239d602decb557628',
						       priority: 10 } ],
						  event_id: 'evt_ee987c0e04827ae091645b2fb106e509' }


		    		*/
    	});

		let connectToStream = (channel) => {
			chat.join(channel).then(state => {

				console.log('*************************');
				console.log('>>> STREAM ACHIEVEMENTS IS WATCHING ' + channel);

				if(channelStatus[channel].bot) {
					connectToBot(channel, channelStatus[channel].bot, true);
				}
				
				console.log('*************************');

				channelStatus[channel].connected = true;
					
			}).catch(err => {
				console.log('\x1b[33m%s\x1b[0m', 'issue joining ' + channel + '\'s channel');
				failedToConnect.push(channel);
			});
		}

		let disconnectFromStream = (channel) => {
			chat.part(channel);
		}

		let connectToBot = (channel, channelData, startup) => {
			let {st, bot} = channelData;

			let slSocketToken = cryptr.decrypt(st);

			let slSocket = io.connect('https://sockets.streamlabs.com?token=' + slSocketToken, {
				reconnection: true
			});

			let msg = `>>> ${channel} is now connected to ${bot}`

			if(!startup) {
				console.log('*************************');
				console.log(msg);
				console.log('*************************');
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

		let joinChannelsOnStartup = () => {
			let channelNames = Object.keys(channelStatus);

			if(channelNames.length > 0) {
				channelNames.forEach(channel => {
					let channelName = channel.toLowerCase();
					connectToStream(channelName);
				});
			}

			let retry = failedToConnect.length > 0;

			while(retry) {
				let retries = failedToConnect.splice(0, failedToConnect.length);

				setTimeout(() => {
					retries.forEach(connectToStream);
				}, 5000);

				retry = failedToConnect.length > 0;
			}
		}

		let channelLiveWatcher = async () => {
			let channelNames = Object.keys(channelStatus);
			let offlineChannels = channelNames.filter(channel => !(channelStatus[channel].online));
			let offset = 0;
			let keepGoing = true;

			while(keepGoing) {
				let response = await axios.get('https://api.twitch.tv/kraken/streams/', {
					params: {
						client_id: client_id,
						channel: offlineChannels.join(),
						limit: 50,
						offset
					}
				});

				let streams = response.data.streams;

				if(streams.length > 0) {
					streams.forEach(channel => {
						let channelName = channel.channel.display_name.toLowerCase();
						connectToStream(channelName);
					});

					if(response.data['_links'].next) {
						offset = offset + 50;
					} else {
						keepGoing = false;
					}
				} else {
					keepGoing = false;
				}		
			}

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
			if(requestQueue.length > 0) {
				//We have achievements to send
				let achievements = requestQueue.slice(0); //Make copy to only process up to this point
				requestQueue.splice(0,requestQueue.length); //clear out queue
				
				console.log('Sending ' + achievements.length + ' achievements...');

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

		//setInterval(channelLiveWatcher, 120000); // Update list of live channels every 2 minutes
		setInterval(sendAchievements, 10000); // Send collected achievements every 10 seconds
	}
})();