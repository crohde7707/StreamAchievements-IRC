const TwitchJS = require('twitch-js').default;
const axios = require('axios');
const io = require("socket.io-client");

const token = process.env.TKN;
const username = process.env.UN;
const client_id = process.env.CID;

const build = require('./utils/regex-builder').build;

const { chat, chatConstants } = new TwitchJS({ token, username });

const port = process.env.PORT || 5000;

let channels = [];
let socket;

let channelStatus = {};

let subListeners = {};
let resubListeners = {};
let giftSubListeners = {};
let raidListeners = {};
let chatListeners = {};
let requestQueue = [];
let failedToConnect = [];

// Achievement Handlers
let newSubHandler = (channel, msg) => {
	let achievementRequest = {
		'channel': channel,
		'achievementID': subListeners[channel].achievement,
		'tier': msg.parameters.subPlan,
		'userID': msg.tags.userId
	};

	requestQueue.push(achievementRequest);
};

let resubHandler = (channel, msg) => {
	let {cumulativeMonths, streakMonths, subPlan} = msg.parameters;
	
	// we dont know which achievement to award, if its total based, or streak based, so check whats available
	let achievements = resubListeners[channel].forEach((listener) => {
		
		if(listener.type === 0 && Number.parseInt(listener.query) <= streakMonths) {
			console.log('  >>> Achievmenet earned: streak')
			//code matched streak && query for achievement matched streak
			let achievementRequest = {
				'channel': channel,
				'type': msg.tags.msgId,
				'tier': subPlan,
				'userID': msg.tags.userId,
				'achievementID': listener.achievement,
				'streak': streakMonths
			};

			requestQueue.push(achievementRequest);

		} else if(listener.type === 1 && Number.parseInt(listener.query) <= cumulativeMonths) {
			//code matched total && query for achievement matched cumulative
			let achievementRequest = {
				'channel': channel,
				'type': msg.tags.msgId,
				'tier': subPlan,
				'userID': msg.tags.userId,
				'achievementID': listener.achievement,
				'cumulative': cumulativeMonths
			};

			requestQueue.push(achievementRequest);
		}
	});
	
};

let giftSubHandler = (channel, msg, totalGifts) => {
	
	let achievementListener = giftSubListeners[channel][totalGifts];
	let {months, recepientID, subPlan} = msg.parameters;

	let achievementRequest = {
		'channel': channel,
		'achievementID': achievementListener.achievement, //Stream Acheivements achievement
		'type': msg.tags.msgId, //type of event (sub, resub, subgift, resub)
		'gifterID': msg.tags.userId, //Person giving the sub
		'recepientID': recipientId, // Person receiving the sub
		'recepientTotalMonths': months, // Total number of months receiving user has subbed (NOT STREAK);
		'tier': subPlan, // (PRIME, 1000, 2000, 3000)
	}

	requestQueue.push(achievementRequest);
};

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
	if(channelStatus[channel]['full-access'] && chatListeners[channel]) {
		let listeners = chatListeners[channel][username];
	
		if(listeners) {
			console.log('we have listeners...');
			//Found listeners from this user
			listeners.forEach(listener => {
				
				let regex = new RegExp(listener.query);
				let matches = msg.match(regex);

				if(matches) {
					//Listener found for 
					console.log(matches);
				}
			});


			/*
				Command: !tacos
				Msg: oxfordsplice [Nacho] - 20584 Tacos [49.60 hours in the stream]
				Query: {viewer}

				Command: !steal @phirehero
				Query: hideoustuber just stole 14 tacos from phirehero

				Command: !gdice
				Query: phirehero is gambling! Dice Roll results: (2,6) Even! 16 tacos have been added into your bag! phirehHype
				Query: phirehero is gambling! Dice Roll results: *dice roll into a storm drain*......damnit

				Command: !gflip
				Query: simskrazzyk is gambling! Coin flip lands on.... it's side, and rolls away.....damnit

				Command: !happy/!sad/!enraged/!frustrated/!focused/!constipated/!inspired/
				Query: ?response from bot or use userid
			*/
		}
	}
	
};

chat.connect();

chat.on('PRIVMSG', (msg) => {
	chatHandler(msg.channel.substr(1), msg.message, msg.username);
});

chat.on('NOTICE/HOST_ON', (msg) => {
	let channel = msg.channel.substr(1);
	
	if(channelStatus[channel]) {
		channelStatus[channel.toLowerCase()].online = false;
		chat.part(channel);
	}
});

chat.on('USERNOTICE/SUBSCRIPTION', (msg) => {
	let channel = msg.channel.substr(1);

	if(subListeners[channel]) {
		newSubHandler(channel, msg);
	}
	console.log('------- SUB -------');
	console.log(msg);
	console.log('-------------------');
});

chat.on('USERNOTICE/RESUBSCRIPTION', (msg) => {

	let channel = msg.channel.substr(1);

	if(resubListeners[channel]) {
		resubHandler(channel, msg);
	}

	console.log(resubListeners[channel]);
	console.log('------- SUB -------');
	console.log(msg);
	console.log('-------------------');
	
});

chat.on('USERNOTICE/SUBSCRIPTION_GIFT', (msg) => {
	let channel = msg.channel.substr(1);
	totalGifts = msg.parameters.senderCount;

	if(giftSubListeners[channel] && giftSubListeners[channel][totalGifts]) {
		giftSubHandler(channel, msg, totalGifts);
	}

	console.log('------- SUB GIFT -------');
	console.log(msg);
	console.log('-------------------');
});

chat.on('USERNOTICE/SUBSCRIPTION_GIFT_COMMUNITY', (msg) => {
	let channel = msg.channel.substr(1);
	console.log('------- SUB GIFT COMMUNITY -------');
	console.log(msg);
	console.log('-------------------');
});

chat.on('USERNOTICE/RAID', (msg) => {
	let channel = msg.channel.substr(1);

	if(raidListeners[channel]) {
		raidHandler(channel, msg);
	}
	console.log('------- RAID -------');
	console.log(msg);
	console.log('-------------------');
});

let retrieveChannelListeners = async () => {

	let keepGoing = true;
	let offset = 0;
	let total;
	while (keepGoing) {
		let response = await axios.get(process.env.API_DOMAIN + '/api/irc/listeners', {
			params: {
				limit: 5,
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
}


let listenerHandler = (listener, method) => {
	let query, key, bot;
	let channel = listener.channel;

	if(method === 'add') {
		switch(listener.code) {
			case "0":
				//Sub
				subListeners[channel] = listener;
				console.log(subListeners[channel]);
				break;

			case "1":
				//Resub
				type = listener.type;
				condition = listener.condition;
				resubListeners[channel] = resubListeners[channel] || [];
				resubListeners[channel].push(listener);
				break;

			case "2":
				//Gifted Sub
				condition = listener.condition;
				giftSubListeners[channel] = giftSubListeners[channel] || [];
				giftSubListeners[channel].push(listener);
				break;

			case "3":
				//Raid
				raidListeners[channel] = listener;
				break;

			case "4":
				//Custom
				bot = listener.bot;
				chatListeners[channel] = chatListeners[channel] || {};
				chatListeners[channel][bot] = chatListeners[channel][bot] || [];

				let builtQuery = build(listener.query);
				listener.query = builtQuery;

				chatListeners[channel][bot].push(listener);
				break;

			default:
				break;
		}
	} else if (method === 'update') {
		switch(listener.code) {
			case "0":
				//Sub
				subListeners[channel] = listener;
				break;

			case "1":
				//Resub
				type = listener.type;
				query = listener.query;
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
				query = listener.query;
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
				bot = listener.bot;
				chatListeners[channel] = chatListeners[channel] || {};
				chatListeners[channel][bot] = chatListeners[channel][bot] || [];

				let builtQuery = build(listener.query);
				listener.query = builtQuery;

				if(chatListeners[channel][bot].length === 0) {
					chatListeners[channel][bot].push(listener);
				} else {
					let index = chatListeners[channel][bot].findIndex(existingListener => {
						existingListener.id === listener.id
					});

					chatListeners[channel][bot].splice(index, 1, listener);	
				}
				break;

			default:
				break;
		}
	} else if (method === 'remove') {
		switch(listener.code) {
			case "0":
				//Sub
				delete subListeners[channel];
				break;

			case "1":
				//Resub
				type = listener.type;
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
				bot = listener.bot;
				
				if(chatListeners[channel] & chatListeners[channel][bot] && chatListeners[channel][bot].length > 0) {
					let index = chatListeners[channel][bot].findIndex(existingListener => {
						existingListener.id === listener.id
					});

					chatListeners[channel][bot].splice(index, 1);
				}
				break;

			default:
				break;
		}
	}
}

let setup = () => {
	return new Promise((resolve, reject) => {
    	socket = io.connect(process.env.API_DOMAIN, {
    		reconnection: true
    	});


    	socket.emit("handshake", {name: "SAIRC"});

		socket.on("new-channel", (channel) => {
			channelStatus[channel.name] = {
				name: channel.name,
				'full-access': channel['full-access'],
				online: false
			}
		});

		socket.on("new-listener", (listener) => {
			console.log('new-listener');
			listenerHandler(listener, "add");
		});

		socket.on("update-listener", (listener) => {
			console.log('update-listener');
			listenerHandler(listener, "update");
		});

		socket.on("remove-listener", (listener) => {
			console.log('remove-listener');
			listenerHandler(listener, "remove");
		});

		socket.on("become-gold", (channel) => {
			channelStatus[channel]['full-access'] = true;
		});

		socket.on("remove-gold", (channel) => {
			channelStatus[channel]['full-access'] = false;
		});

		socket.on("achievement-awarded", (achievement) => {
			//say something in chat for now
			if(process.env.NODE_ENV === 'production') {
				chat.action(achievement.channel, `${achievement.member} just earned the ${achievement.title} achievement!`);
			} else {
				chat.whisper(achievement.channel, `${achievement.member} just earned the ${achievement.title} achievement!`);	
			}
			
		});

		socket.on("achievement-awarded-nonMember", (achievement) => {
			if(process.env.NODE_ENV === 'production') {
				chat.action(achievement.channel, `${achievement.member} just earned the ${achievement.title} achievement!`);
			} else {
				chat.whisper(achievement.channel, `${achievement.member} just earned the ${achievement.title} achievement!`);	
			}
		})
		
		axios.get(process.env.API_DOMAIN + '/api/irc/channels', {
			withCredentials: true
		}).then(apiResponse => {
			channels = apiResponse.data.channels;
			channels.forEach(channel => {
				channelStatus[channel.name] = {
					name: channel.name,
					'full-access': channel['full-access'],
					online: false
				}
			});
			
			resolve();
		});
	});
}

 setup().then(() => {
 	console.log("===========================");
 	console.log("   IRC IS UP AND RUNNING   ");
 	console.log("===========================");
 	console.log("\n");
 	console.log("Channels to watch: " + channels.length);
 	console.log("\n");

 	//Get Listeners for channels
 	retrieveChannelListeners();
 	//Call out to see who is live
 	channelLiveWatcher();
});



let connectToStream = (channel) => {
	chat.connect().then(clientState => {
		chat.join(channel).then(state => {
			console.log('*************************');
			console.log('>>> STREAM ACHIEVEMENTS IS WATCHING ' + channel);
			console.log('*************************');

			if(channelStatus[channel]) {
				channelStatus[channel].online = true;	
			}
			
		}).catch(err => {
			console.log('\x1b[33m%s\x1b[0m', 'issue joining channel');
			failedToConnect.push(channel);
		});
	}).catch(err => {
		failedToConnect.push(channel);
		console.log('\x1b[33m%s\x1b[0m', 'issue connecting to chat');
	});
}

let channelLiveWatcher = async () => {
	let channelNames = Object.keys(channelStatus);
	let offlineChannels = channelNames.filter(channel => !channelStatus[channel].online);
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
			console.log("No streams online");
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

setInterval(channelLiveWatcher, 120000); // Update list of live channels every 2 minutes
//setInterval(retrieveChannelListeners, 900000) // Gather all channel listeners every 15 minutes
setInterval(sendAchievements, 10000); // Send collected achievements every 10 seconds

/*
	Stream ends
	i HOSTTARGET/#jazzyrosee lostinsophie
	i NOTICE/HOST_ON/#jazzyrosee tmi.twitch.tv: Now hosting lostinsophie.
*/

/*
	Events:
	PRIVMSG: Message in chat
	USERNOTICE/RESUBSCRIPTION: Resub
	*/
