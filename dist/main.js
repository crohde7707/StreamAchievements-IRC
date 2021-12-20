!function(e){var t={};function n(s){if(t[s])return t[s].exports;var o=t[s]={i:s,l:!1,exports:{}};return e[s].call(o.exports,o,o.exports,n),o.l=!0,o.exports}n.m=e,n.c=t,n.d=function(e,t,s){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:s})},n.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.t=function(e,t){if(1&t&&(e=n(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var s=Object.create(null);if(n.r(s),Object.defineProperty(s,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var o in e)n.d(s,o,function(t){return e[t]}.bind(null,o));return s},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="",n(n.s=0)}([function(e,t,n){e.exports=n(1)},function(module,exports,__webpack_require__){const fs=__webpack_require__(2),TwitchClient=__webpack_require__(3).default,ChatClient=__webpack_require__(4).default,Cryptr=__webpack_require__(5),cryptr=new Cryptr(process.env.SCK),uuid=__webpack_require__(6),axios=__webpack_require__(7),io=__webpack_require__(8),token=process.env.TKN,username=process.env.UN,client_id=process.env.CID,{build:build,getCondition:getCondition}=__webpack_require__(9),port=process.env.PORT||5e3;let socket,twitchClient,channelStatus={},followListeners={},donationListeners={},bitsListeners={},subListeners={},resubListeners={},giftSubListeners={},raidListeners={},chatListeners={},connectedBots={},socketLookup={},channelClientLookup={},requestQueue=[],failedToConnect=[],DEBUG_ENABLED=!1,IRCAT,IRCRT,IRCEXPIRES,clientConnections={},debugLog=e=>{(DEBUG_ENABLED||process.env.DEBUG_ENABLED)&&console.log("(i) "+e)},newSubHandler=(e,t,n)=>{let{plan:s,userId:o}=t;subListeners[e]&&subListeners[e].forEach(t=>{if(t.condition===s){let n={channel:e,achievementID:t.achievement,tier:s,userID:o};requestQueue.push(n)}})},newFollowHandler=(e,t)=>{if(followListeners[e]){let n={channel:e,achievementID:followListeners[e].achievement,userID:t[0].id,user:t[0].name};requestQueue.push(n)}},donationHandler=(e,t)=>{if(donationListeners[e]){let n={channel:e,achievementID:donationListeners[e].achievement,user:t[0].name,amount:t[0].amount};requestQueue.push(n)}},bitsHandler=(e,t)=>{if(bitsListeners[e]){let n={channel:e,achievementID:bitsListeners[e].achievement,user:t[0].name};requestQueue.push(n)}},resubHandler=(e,t,n)=>{let s,{months:o,streak:i,plan:c,userId:r}=t;if(resubListeners[e]){if(resubListeners[e].forEach(e=>{if(Number.parseInt(e.condition)<=o)if(s){let t=o-Number.parseInt(s.condition);o-Number.parseInt(e.condition)<t&&(s=e)}else s=e}),s){let t={channel:e,type:"resub",tier:c,userID:r,achievementID:s.achievement,cumulative:o};debugLog("Resub Achievement"),debugLog(JSON.stringify(t)),requestQueue.push(t)}}else subListeners[e]&&newSubHandler(e,t,n)},giftCommunitySubHandler=(e,t,n,s)=>{let o=giftSubListeners[e],{plan:i,gifterUserId:c}=t,r=n.tags.get("msg-id");o.forEach(t=>{if(t.condition<=s){let n={channel:e,achievementID:t.achievement,type:r,userID:c,tier:i};debugLog("Community Sub Achievement"),debugLog(JSON.stringify(n)),requestQueue.push(n)}})},giftSubHandler=(e,t,n,s)=>{let o=giftSubListeners[e],{months:i,plan:c,gifterUserId:r}=t;o.forEach(t=>{let n;try{n=Number.parseInt(t.condition)}catch(e){console.log("Gift Sub Condition could not parse to an integer")}if(n<=s){let n={channel:e,achievementID:t.achievement,type:"subgift",userID:r,tier:c};debugLog("Gift Sub Achievement"),debugLog(JSON.stringify(n)),requestQueue.push(n)}}),awardRecipient(e,t,n)},awardRecipient=(e,t,n)=>{let s,{plan:o,userId:i}=t;try{s=Number.parseInt(t.months)}catch(e){console.log("months could not parse into an integer")}if(s)if(s>1){if(console.log("got some resub listeners, check them..."),resubListeners[e]){let t;if(resubListeners[e].forEach(e=>{if(Number.parseInt(e.condition)<=s)if(t){let n=s-Number.parseInt(t.condition);s-Number.parseInt(e.condition)<n&&(t=e)}else t=e}),t){let n={channel:e,type:"resub",tier:o,userID:i,achievementID:t.achievement,cumulative:s};debugLog("Award Recipient of Gift Achievement"),debugLog(JSON.stringify(n)),requestQueue.push(n)}}}else 1===s&&subListeners[e]&&subListeners[e].forEach(t=>{if(t.condition===o){let n={channel:e,achievementID:t.achievement,tier:o,userID:i};requestQueue.push(n)}})},raidHandler=e=>{let t=raidListeners[channel],n={channel:channel,achievementID:t,type:e.tags.msgId,userID:e.tags.userId};requestQueue.push(n)},getAllowedListeners=e=>{let t=[];return t=e.filter(e=>e.unlocked||"5"===e.achType),t},chatHandler=(channel,msg,username)=>{if(channelStatus[channel]&&chatListeners[channel]){let listeners=chatListeners[channel][username];listeners&&(channelStatus[channel]["full-access"]||(listeners=getAllowedListeners(listeners)),listeners.forEach(listener=>{let regex=new RegExp(listener.query),matches=msg.match(regex);if(matches){let match=!0,user=matches.groups.user;if(listener.condition)if("occured"===listener.condition){let e={channel:channel,user:user,achievementID:listener.achievement};requestQueue.push(e)}else if(Array.isArray(listener.condition));else try{let{condition:condition,operator:operator,solution:solution}=listener.condition;"="===operator&&(operator="===");let award=!1,desired=matches.groups[condition];if(desired)if("time"===condition){let desiredTime=desired.replace(/[\.,\s]*/g,""),solutionTime=solution.replace(/[\.,\s]*/g,"");debugLog(eval(desiredTime+operator+solutionTime)),award=eval(desiredTime+operator+solutionTime)}else if(isNaN(parseFloat(solution)))"==="===operator&&(award=desired===solution);else{let desiredNum=desired.replace(/[\.,\s]*/g,""),solutionNum=solution.replace(/[\.,\s]*/g,"");award=eval(desiredNum+operator+solutionNum)}if(award){let e={channel:channel,achievementID:listener.achievement,user:user};requestQueue.push(e)}}catch(e){console.log(e),console.log("*******************************"),console.log("Error parsing chat listener"),console.log("Channel: "+channel),console.log("Msg: "+msg),console.log("*******************************")}}}))}if(0===msg.indexOf("!sachievement award ")){let e=msg.substr(20).split(" "),t=e.shift(),n=e.join(" ");try{axios({method:"post",url:process.env.API_DOMAIN+"/api/achievement/award/chat",data:{user:username,target:t,achievement:n,channel:channel}})}catch(e){console.log(">>> Issue manually awarding through chat")}}},createClientConnection=async e=>{let t,n=await TwitchClient.withCredentials(process.env.IRCCID,IRCAT,void 0,{clientSecret:process.env.IRCCS,refreshToken:IRCRT,expiry:new Date(IRCEXPIRES)||0,onRefresh:async({accessToken:e,refreshToken:t,expiryDate:n})=>{let s=cryptr.encrypt(e),o=cryptr.encrypt(t),i=null===n?0:n.getTime();await axios.put(process.env.API_DOMAIN+"/api/irc/init",{at:s,rt:o,expires_in:i})}}),s=await ChatClient.forTwitchClient(n);return await s.connect(),await s.waitForRegistration(),s.onPrivmsg((e,t,n)=>{chatHandler(e.substr(1).toLowerCase(),n,t)}),s.onAction((e,t,n)=>{chatHandler(e.substr(1).toLowerCase(),n,t)}),s.onSub((e,t,n,s)=>{let o=e.substr(1).toLowerCase();subListeners[o]&&newSubHandler(o,n,s),debugLog("------- SUB -------"),debugLog(n),debugLog("-------------------")}),s.onResub((e,t,n,s)=>{let o=e.substr(1).toLowerCase();resubListeners[o]&&resubHandler(o,n,s),debugLog("------- RESUB -------"),debugLog(n),debugLog("-------------------")}),s.onCommunitySub((e,t,n,s)=>{debugLog("----- COMMUNITY SUB -----"),debugLog(n),debugLog("---------------------");let o=e.substr(1).toLowerCase(),i=n.gifterGiftCount;giftSubListeners[o]&&giftCommunitySubHandler(o,n,s,i)}),s.onCommunityPayForward((e,t,n,s)=>{console.log("----- COMMUNITY PAY FORWARD -----"),console.log(n),console.log("---------------------")}),s.onStandardPayForward((e,t,n,s)=>{console.log("----- STANDARD PAY FORWARD -----"),console.log(n),console.log("---------------------")}),s.onPrimeCommunityGift((e,t,n,s)=>{console.log("----- PRIME COMMUNITY GIFT -----"),console.log(n),console.log("---------------------")}),s.onSubExtend((e,t,n,s)=>{console.log("----- SUB EXTEND -----"),console.log(n),console.log("---------------------")}),s.onSubGift((e,t,n,s)=>{debugLog("------- SUB GIFT -------"),debugLog(n),debugLog("-------------------");let o=e.substr(1).toLowerCase(),i=n.gifterGiftCount;0===n.gifterGiftCount?awardRecipient(o,n,s):giftSubListeners[e]&&giftSubHandler(o,n,s,i)}),s.onBitsBadgeUpgrade((e,t,n,s)=>{console.log("------- BIT BADGE -------"),console.log(n),console.log("-------------------"),console.log(s)}),s.onDisconnect((e,t)=>{console.log(">>> CHATCLIENT DISCONNECTED <<<"),s.id&&(console.log(s.id+" was disconnected: "+(new Date).toLocaleString()),handleReconnect(s.id)),e&&console.log(">>> ChatClient was disconnected manually"),console.log(t)}),e?(delete clientConnections[e],t=e):t="twitchClient"+Object.keys(clientConnections).length,s.id=t,clientConnections[t]={id:t,client:s,connections:0,channels:[]},clientConnections[t]},handleReconnect=async e=>{let t=clientConnections[e].channels,n=await createClientConnection(e);asyncForEach(t,async e=>{console.log("> Reconnecting to "+e);let t=e.toLowerCase();try{connectToStream(t,!1,n)}catch(e){console.log("error occured reconnecting to "+t),console.log(e)}})},connectToStream=async(e,t,n)=>{console.log("connecting to: "+e);try{let o;if(t&&(channelStatus[e]=channelStatus[t],channelStatus[e].name=e,delete channelStatus[t]),n)o=n;else{let e=Object.keys(clientConnections);for(var s=0;s<e.length;s++)if(clientConnections[e[s]].connections<15){o=clientConnections[e[s]];break}void 0===o&&(o=await createClientConnection())}await o.client.join(e);console.log("*************************"),console.log(">>> STREAM ACHIEVEMENTS IS WATCHING "+e+" ON "+o.id),channelStatus[e].bot&&connectToBot(e,channelStatus[e].bot,!0),console.log("*************************"),channelStatus[e].connected=!0,o.connections=o.connections+1,channelStatus[e].clientID=o.id,o.channels.push(e)}catch(t){console.log(t),console.log("[33m%s[0m","issue joining "+e+"'s channel"),failedToConnect.push(e)}},connectToBot=(e,t,n)=>{let{st:s,bot:o}=t,i=cryptr.decrypt(s),c=io.connect("https://sockets.streamlabs.com?token="+i,{reconnection:!0}),r=`>>> ${e} is now connected to ${o}`;n?console.log(r):(console.log("**************************"),console.log(r),console.log("**************************")),c.SAID=uuid(),setupSocketEvents(e,c),socketLookup[c.SAID]=e,connectedBots[e]||(connectedBots[e]={}),connectedBots[e][o]=c},setupSocketEvents=(e,t)=>{t.on("event",e=>{let n=socketLookup[t.SAID];if("donation"===e.type)donationHandler(n,e.message);else if("twitch_account"===e.for)switch(e.type){case"follow":newFollowHandler(n,e.message);break;case"bits":bitsHandler(n,e.message)}})};async function asyncForEach(e,t){for(let n=0;n<e.length;n++)await t(e[n],n,e)}(async()=>{let e=await axios.get(process.env.API_DOMAIN+"/api/irc/init"),t=async e=>{let t,s=!0,o=0;for(;s;){let i={limit:50,offset:o,total:t};e&&(i.channels=e);let c=await axios.get(process.env.API_DOMAIN+"/api/irc/listeners",{params:i,withCredentials:!0});c.data.listeners.forEach(e=>{n(e,"add")}),t=c.data.total,c.data.offset?o=c.data.offset:s=!1}console.log("> listeners retrieved")},n=(e,t)=>{let n,s=e.channel,o=e.prevBots||{};delete e.prevBots;try{if("add"===t)switch(e.achType){case"0":subListeners[s]=subListeners[s]||[],subListeners[s].push(e);break;case"1":resubListeners[s]=resubListeners[s]||[],resubListeners[s].push(e);break;case"2":giftSubListeners[s]=giftSubListeners[s]||[],giftSubListeners[s].push(e);break;case"3":raidListeners[s]=e;break;case"4":if(Object.keys(e.bots).length>0){Object.keys(e.bots).forEach((t,n)=>{let o={...e},i=e.bots["bot"+n].toLowerCase();chatListeners[s]=chatListeners[s]||{},chatListeners[s][i]=chatListeners[s][i]||[];let c=build(e.queries["query"+n]);o.query=c;try{o.condition=getCondition(e.conditions["condition"+n]),chatListeners[s][i].push(o)}catch(t){console.log("Issue with loading condition for "+e.achievement)}})}else{n=e.bot.toLowerCase(),chatListeners[s]=chatListeners[s]||{},chatListeners[s][n]=chatListeners[s][n]||[];let t=build(e.query);e.query=t;try{e.condition=getCondition(e.condition),chatListeners[s][n].push(e)}catch(t){console.log("Issue with loading condition for "+e.achievement)}}break;case"5":if(followListeners[s]=e,console.log(followListeners[s]),e.bot){n=e.bot.toLowerCase(),chatListeners[s]=chatListeners[s]||{},chatListeners[s][n]=chatListeners[s][n]||[];let t=build(e.query);e.query=t;try{e.condition=getCondition(e.condition),chatListeners[s][n].push(e),console.log(chatListeners[s][n])}catch(t){console.log("Issue with loading condition for "+e.achievement)}}break;case"6":donationListeners[s]=e;break;case"7":bitsListeners[s]=e}else if("update"===t)switch(e.achType){case"0":if(subListeners[s]=subListeners[s]||[],0===subListeners[s].length)subListeners[s].push(e);else{let t=subListeners[s].findIndex(t=>t.achievement===e.achievement);subListeners[s].splice(t,1,e)}break;case"1":if(resubListeners[s]=resubListeners[s]||[],0===resubListeners[s].length)resubListeners[s].push(e);else{let t=resubListeners[s].findIndex(t=>t.achievement===e.achievement);resubListeners[s].splice(t,1,e)}break;case"2":if(giftSubListeners[s]=giftSubListeners[s]||[],0===giftSubListeners[s].length)giftSubListeners[s].push(e);else{let t=giftSubListeners[s].findIndex(t=>t.achievement===e.achievement);giftSubListeners[s].splice(t,1,e)}break;case"3":raidListeners[s]=e;break;case"4":if(Object.keys(e.bots).length>0){let t=Object.keys(e.bots);Object.keys(o).forEach((t,n)=>{let i=o["bot"+n].toLowerCase();chatListeners[s]=chatListeners[s]||{},chatListeners[s][i]=chatListeners[s][i]||[];let c=chatListeners[s][i].findIndex(t=>t.achievement===e.achievement);c>-1&&chatListeners[s][i].splice(c,1)}),t.forEach((t,n)=>{let o={...e},i=e.bots["bot"+n].toLowerCase();chatListeners[s]=chatListeners[s]||{},chatListeners[s][i]=chatListeners[s][i]||[];let c=build(e.queries["query"+n]);o.query=c;try{o.condition=getCondition(e.conditions["condition"+n]),chatListeners[s][i].push(o)}catch(t){console.log("Issue with loading condition for "+e.achievement)}})}else{n=e.bot.toLowerCase(),chatListeners[s]=chatListeners[s]||{},chatListeners[s][n]=chatListeners[s][n]||[];let t=build(e.query);e.query=t;try{if(e.condition=getCondition(e.condition),0===chatListeners[s][n].length)chatListeners[s][n].push(e);else{let t=chatListeners[s][n].findIndex(t=>t.achievement===e.achievement);chatListeners[s][n].splice(t,1,e)}}catch(t){console.log("Issue with loading condition for "+e.achievement)}}break;case"5":followListeners[s]=e;break;case"6":donationListeners[s]=e;break;case"7":bitsListeners[s]=e}else if("remove"===t)switch(e.achType){case"0":if(subListeners[s]&&subListeners[s].length>0){let t=subListeners[s].findIndex(t=>t.achievement===e.achievement);subListeners[s].splice(t,1)}break;case"1":if(query=e.query,resubListeners[s]&&resubListeners[s].length>0){let t=resubListeners[s].findIndex(t=>t.achievement===e.achievement);resubListeners[s].splice(t,1)}break;case"2":if(query=e.query,giftSubListeners[s]&&giftSubListeners[s].length>0){let t=giftSubListeners[s].findIndex(t=>t.achievement===e.achievement);giftSubListeners[s].splice(t,1)}break;case"3":delete raidListeners[s];break;case"4":if(Object.keys(e.bots).length>0){Object.keys(e.bots).forEach((t,n)=>{let o=e.bots["bot"+n].toLowerCase();chatListeners[s]=chatListeners[s]||{},chatListeners[s][o]=chatListeners[s][o]||[];let i=chatListeners[s][o].findIndex(t=>t.achievement===e.achievement);i>-1&&chatListeners[s][o].splice(i,1)})}else if(n=e.bot.toLowerCase(),chatListeners[s]&chatListeners[s][n]&&chatListeners[s][n].length>0){let t=chatListeners[s][n].findIndex(t=>t.achievement===e.achievement);chatListeners[s][n].splice(t,1)}break;case"5":delete followListeners[s];break;case"6":delete donationListeners[s];break;case"7":delete bitsListeners[s]}}catch(n){console.log("Error when handling listener"),console.log("Handle type: "+t),console.log("listener:"),console.log(e)}};e.data&&e.data.at&&e.data.rt?(IRCAT=cryptr.decrypt(e.data.at),IRCRT=cryptr.decrypt(e.data.rt),IRCEXPIRES=e.data.expires_in,new Promise((e,o)=>{socket=io.connect(process.env.SOCKET_DOMAIN,{reconnection:!0}),socket.emit("handshake",{name:"SAIRC"}),socket.on("new-channel",e=>{console.log("-------------------------------"),console.log("["+e.name+"] New channel created!"),console.log("-------------------------------"),channelStatus[e.name]={name:e.name,"full-access":e["full-access"],connected:!1},connectToStream(e.name)}),socket.on("channel-update",e=>{console.log("-------------------------------"),console.log("["+e.old+"] has updated their channel name to "+e.new),console.log("-------------------------------"),e.old&&e.new?(channelStatus[e.old]&&channelStatus[e.old].connected&&s(e.old),channelStatus[e.new]={name:e.new,"full-access":e.fullAccess,connected:!1},connectToStream(e.new),t([e.new])):(console.log("Something went wrong with channel update, check logs"),console.log(e))}),socket.on("new-listener",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] Adding listener for "+e.achievement),console.log("-------------------------------"),n(e,"add"),console.log(chatListeners.phirehero)}),socket.on("update-listener",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] Updating listener for "+e.achievement),console.log("-------------------------------"),n(e,"update")}),socket.on("remove-listener",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] Removing listener for "+e.achievement),console.log("-------------------------------"),n(e,"remove")}),socket.on("become-gold",e=>{console.log("-------------------------------"),console.log("["+e+"] just gained gold status!"),console.log("-------------------------------"),channelStatus[e]&&(channelStatus[e]["full-access"]=!0)}),socket.on("remove-gold",e=>{console.log("-------------------------------"),console.log("["+e+"] just lost gold status!"),console.log("-------------------------------"),channelStatus[e]&&(channelStatus[e]["full-access"]=!1)}),socket.on("connect-bot",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] just connected "+e.bot+"!"),console.log("-------------------------------"),connectToBot(e.channel,e)}),socket.on("disconnect-bot",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] just disconnected "+e.bot+"!"),console.log("-------------------------------");let{channel:t,bot:n}=e;if(connectedBots[t]&&connectedBots[t][n]){let s=connectedBots[t][n],o=s.id;console.log(">>> disconnect-bot: "+e.channel+": "+e.bot),s.close(),delete connectedBots[t][n],delete socketLookup[o]}}),socket.on("delete-channel",e=>{channelStatus[e]&&channelStatus[e].connected&&s(e)}),socket.on("achievement-awarded",e=>{debugLog(JSON.stringify(e));try{let{channel:t,message:n}=e,s=channelStatus[t].clientID;console.log("sending to "+s),clientConnections[s].client.say(t,n)}catch(e){console.log("Error occured in achievement-awarded")}}),socket.on("achievement-awarded-nonMember",e=>{debugLog(JSON.stringify(e));try{let{channel:t,message:n}=e,s=channelStatus[t].clientID;console.log("sending to "+s+":"+t),clientConnections[s].client.say(t,n)}catch(e){console.log("Error occured in achievement-awarded-nonMember")}}),socket.on("retrieve-listeners",e=>{let t={};t.follow=followListeners[e],t.donation=donationListeners[e],t.bits=bitsListeners[e],t.sub=subListeners[e],t.resub=resubListeners[e],t.gift=giftSubListeners[e],t.raid=raidListeners[e],t.chat=chatListeners[e],socket.emit("listeners-retrieved",JSON.stringify(t))}),e()}).then(()=>{console.log("==========================="),console.log("   IRC IS UP AND RUNNING   "),console.log("==========================="),console.log("\n"),(async()=>{let e,t=!0,n=0;for(;t;){let s=await axios.get(process.env.API_DOMAIN+"/api/irc/channels",{params:{limit:50,offset:n,total:e},withCredentials:!0});s.data.channels.forEach(e=>{channelStatus[e.name]={name:e.name,"full-access":e["full-access"],connected:!1,bot:e.bot||!1}}),e=s.data.total,s.data.offset?n=s.data.offset:(t=!1,console.log("> channels retrieved!"),o())}})(),t(),setInterval(i,1e4)})):console.log(">>> ERROR RETRIEVING IRC DATA FROM SERVER");let s=e=>{console.log(">>> disconnectFromStream: "+e);let t=channelStatus[e].clientID,n=clientConnections[t];if(n.client.part("#"+e),delete followListeners[e],delete donationListeners[e],delete bitsListeners[e],delete subListeners[e],delete resubListeners[e],delete giftSubListeners[e],delete raidListeners[e],delete chatListeners[e],connectedBots[e]){Object.keys(connectedBots[e]).forEach(t=>{let n=connectedBots[e][t],s=n.id;console.log(">>> closing socket for bot: "+t),n.close(),delete connectedBots[e][t],delete socketLookup[s]})}delete channelStatus[e],clientConnections[t].connections=n.connections-1,console.log("*************************"),console.log(`>>> ${e} has deleted their channel!`),console.log("*************************")},o=async()=>{let e=Object.keys(channelStatus);console.log(e),e.length>0&&asyncForEach(e,async e=>{let t=e.toLowerCase();await connectToStream(t)}),setTimeout(()=>{failedToConnect.length>0&&axios({method:"post",url:process.env.API_DOMAIN+"/api/channel/update",data:failedToConnect}).then(e=>{e.data.updatedChannels&&(e.data.updatedChannels.forEach(e=>{let t=e.new.toLowerCase();connectToStream(t,e.old)}),t(e.data.updatedChannels.map(e=>e.new)))})},2e4);let n=failedToConnect.length>0;for(;n;){let e=failedToConnect.splice(0,failedToConnect.length);setTimeout(()=>{e.forEach(connectToStream)},5e3),n=failedToConnect.length>0}},i=()=>{if(console.log(requestQueue),requestQueue.length>0){let e=requestQueue.slice(0);requestQueue.splice(0,requestQueue.length),console.log("\nSending "+e.length+" achievements..."),axios({method:"post",url:process.env.API_DOMAIN+"/api/achievement/listeners",data:e})}}})()},function(e,t){e.exports=require("fs")},function(e,t){e.exports=require("twitch")},function(e,t){e.exports=require("twitch-chat-client")},function(e,t){e.exports=require("cryptr")},function(e,t){e.exports=require("uuid/v1")},function(e,t){e.exports=require("axios")},function(e,t){e.exports=require("socket.io-client")},function(e,t){let n={"{user}":/(?<user>[a-zA-Z0-9_]+)/,"{target}":/(?<target>[a-zA-Z0-9_]+)/,"{amount}":/(?<amount>[0-9,\.]+)/,"{total}":/(?<total>[0-9,\.]+)/,"{time}":/(?<time>[0-9,\.\s]+)/,"{ignore}":/(?<ignore>.+)/,"{ignore2}":/(?<ignore2>.+)/,"{ignore3}":/(?<ignore3>.+)/,"{followage}":/(?<followage>[1-9]+\s(second[s]*|minute[s]*|day[s]*|week[s]*|month[s]*|year[s]*).*)/};e.exports={build:e=>{let t=Object.keys(n),s=e;return s=s.replace(/[.*+?^$()|[\]\\]/g,"\\$&"),t.forEach(e=>{s=s.replace(new RegExp(e,"gi"),n[e].source)}),s},getCondition:e=>{if(""===e||void 0===e)return"occured";{let t=new RegExp(/(?<condition>[a-zA-Z0-9_]+)(?<operator>[=<>]+)(?<solution>[a-zA-Z0-9_,\.]+)/),n=e.match(t);return n.groups?n.groups:(console.log("error getting condition for the following: "+e),"error")}}}}]);