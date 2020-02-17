!function(e){var t={};function n(s){if(t[s])return t[s].exports;var o=t[s]={i:s,l:!1,exports:{}};return e[s].call(o.exports,o,o.exports,n),o.l=!0,o.exports}n.m=e,n.c=t,n.d=function(e,t,s){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:s})},n.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.t=function(e,t){if(1&t&&(e=n(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var s=Object.create(null);if(n.r(s),Object.defineProperty(s,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var o in e)n.d(s,o,function(t){return e[t]}.bind(null,o));return s},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="",n(n.s=0)}([function(e,t,n){e.exports=n(1)},function(module,exports,__webpack_require__){const fs=__webpack_require__(2),TwitchClient=__webpack_require__(3).default,ChatClient=__webpack_require__(4).default,Cryptr=__webpack_require__(5),cryptr=new Cryptr(process.env.SCK),uuid=__webpack_require__(6),axios=__webpack_require__(7),io=__webpack_require__(8),token=process.env.TKN,username=process.env.UN,client_id=process.env.CID,{build:build,getCondition:getCondition}=__webpack_require__(9),port=process.env.PORT||5e3;let socket,twitchClient,channelStatus={},followListeners={},donationListeners={},bitsListeners={},subListeners={},resubListeners={},giftSubListeners={},raidListeners={},chatListeners={},connectedBots={},socketLookup={},requestQueue=[],failedToConnect=[],DEBUG_ENABLED=!1,IRCAT,IRCRT,IRCEXPIRES,clientConnections={},debugLog=e=>{(DEBUG_ENABLED||process.env.DEBUG_ENABLED)&&console.log("(i) "+e)},newSubHandler=(e,t,n)=>{let{plan:s,userId:o}=t;subListeners[e]&&subListeners[e].forEach(t=>{if(t.condition===s){let n={channel:e,achievementID:t.achievement,tier:s,userID:o};requestQueue.push(n)}})},newFollowHandler=(e,t)=>{if(followListeners[e]){let n={channel:e,achievementID:followListeners[e].achievement,userID:t[0].id,user:t[0].name};requestQueue.push(n)}},donationHandler=(e,t)=>{if(donationListeners[e]){let n={channel:e,achievementID:donationListeners[e].achievement,user:t[0].name,amount:t[0].amount};requestQueue.push(n)}},bitsHandler=(e,t)=>{if(bitsListeners[e]){let n={channel:e,achievementID:bitsListeners[e].achievement,user:t[0].name};requestQueue.push(n)}},resubHandler=(e,t,n)=>{let s,{months:o,streak:i,plan:c,userId:l}=t;if(resubListeners[e]){if(resubListeners[e].forEach(e=>{if(Number.parseInt(e.condition)<=o)if(s){let t=o-Number.parseInt(s.condition);o-Number.parseInt(e.condition)<t&&(s=e)}else s=e}),s){let t={channel:e,type:"resub",tier:c,userID:l,achievementID:s.achievement,cumulative:o};debugLog("Resub Achievement"),debugLog(JSON.stringify(t)),requestQueue.push(t)}}else subListeners[e]&&newSubHandler(e,t,n)},giftCommunitySubHandler=(e,t,n,s)=>{let o=giftSubListeners[e],{plan:i,gifterUserId:c}=t,l=n.tags.get("msg-id");o.forEach(t=>{if(t.condition<=s){let n={channel:e,achievementID:t.achievement,type:l,userID:c,tier:i};debugLog("Community Sub Achievement"),debugLog(JSON.stringify(n)),requestQueue.push(n)}})},giftSubHandler=(e,t,n,s)=>{let o=giftSubListeners[e],{months:i,plan:c,gifterUserId:l}=t;o.forEach(t=>{let n;try{n=Number.parseInt(t.condition)}catch(e){console.log("Gift Sub Condition could not parse to an integer")}if(console.log(),n<=s){let n={channel:e,achievementID:t.achievement,type:"subgift",userID:l,tier:c};debugLog("Gift Sub Achievement"),debugLog(JSON.stringify(n)),requestQueue.push(n)}}),awardRecipient(e,t,n)},awardRecipient=(e,t,n)=>{let s,{plan:o,userId:i}=t;try{s=Number.parseInt(t.months)}catch(e){console.log("months could not parse into an integer")}if(s)if(s>1){if(console.log("got some resub listeners, check them..."),resubListeners[e]){let t;if(resubListeners[e].forEach(e=>{if(Number.parseInt(e.condition)<=s)if(t){let n=s-Number.parseInt(t.condition);s-Number.parseInt(e.condition)<n&&(t=e)}else t=e}),t){let n={channel:e,type:"resub",tier:o,userID:i,achievementID:t.achievement,cumulative:s};debugLog("Award Recipient of Gift Achievement"),debugLog(JSON.stringify(n)),requestQueue.push(n)}}}else 1===s&&subListeners[e]&&subListeners[e].forEach(t=>{if(t.condition===o){let n={channel:e,achievementID:t.achievement,tier:o,userID:i};requestQueue.push(n)}})},raidHandler=e=>{let t=raidListeners[channel],n={channel:channel,achievementID:t,type:e.tags.msgId,userID:e.tags.userId};requestQueue.push(n)},getAllowedListeners=e=>{let t=[];return t=e.filter(e=>e.unlocked||"5"===e.achType)},chatHandler=(channel,msg,username)=>{if(channelStatus[channel]&&chatListeners[channel]){let listeners=chatListeners[channel][username];listeners&&(channelStatus[channel]["full-access"]||(listeners=getAllowedListeners(listeners)),listeners.forEach(listener=>{let regex=new RegExp(listener.query),matches=msg.match(regex);if(matches){let match=!0,user=matches.groups.user;if(listener.condition)if("occured"===listener.condition){let e={channel:channel,user:user,achievementID:listener.achievement};requestQueue.push(e)}else if(Array.isArray(listener.condition));else try{let{condition:condition,operator:operator,solution:solution}=listener.condition;"="===operator&&(operator="===");let award=!1,desired=matches.groups[condition];if(desired)if("time"===condition){let desiredTime=desired.replace(/[\.,\s]*/g,""),solutionTime=solution.replace(/[\.,\s]*/g,"");debugLog("Time based achievement for "+channel+": "+user),debugLog("desiredTime: "+desiredTime),debugLog("solutionTime: "+solutionTime),debugLog(eval(desiredTime+operator+solutionTime)),award=eval(desiredTime+operator+solutionTime)}else isNaN(parseFloat(solution))?"==="===operator&&(award=desired===solution):award=eval(desired+operator+solution);if(award){let e={channel:channel,achievementID:listener.achievement,user:user};requestQueue.push(e)}}catch(e){console.log(e),console.log("*******************************"),console.log("Error parsing chat listener"),console.log("Channel: "+channel),console.log("Msg: "+msg),console.log("*******************************")}}}))}if(0===msg.indexOf("!sachievement award ")){let e=msg.substr(20).split(" "),t=e.shift(),n=e.join(" ");try{axios({method:"post",url:process.env.API_DOMAIN+"/api/achievement/award/chat",data:{user:username,target:t,achievement:n,channel:channel}})}catch(e){console.log(">>> Issue manually awarding through chat")}}},createClientConnection=async()=>{let e=await TwitchClient.withCredentials(process.env.IRCCID,IRCAT,void 0,{clientSecret:process.env.IRCCS,refreshToken:IRCRT,expiry:new Date(IRCEXPIRES)||0,onRefresh:async({accessToken:e,refreshToken:t,expiryDate:n})=>{let s=cryptr.encrypt(e),o=cryptr.encrypt(t),i=null===n?0:n.getTime();await axios.put(process.env.API_DOMAIN+"/api/irc/init",{at:s,rt:o,expires_in:i})}}),t=await ChatClient.forTwitchClient(e);await t.connect(),await t.waitForRegistration(),t.onPrivmsg((e,t,n)=>{chatHandler(e.substr(1).toLowerCase(),n,t)}),t.onAction((e,t,n)=>{chatHandler(e.substr(1).toLowerCase(),n,t)}),t.onSub((e,t,n,s)=>{let o=e.substr(1).toLowerCase();subListeners[o]&&newSubHandler(o,n,s),console.log("------- SUB -------"),console.log(n),console.log("-------------------")}),t.onResub((e,t,n,s)=>{let o=e.substr(1).toLowerCase();resubListeners[o]&&resubHandler(o,n,s),console.log("------- RESUB -------"),console.log(n),console.log("-------------------")}),t.onCommunitySub((e,t,n,s)=>{console.log("----- COMMUNITY SUB -----"),console.log(n),console.log("---------------------");let o=e.substr(1).toLowerCase(),i=n.gifterGiftCount;giftSubListeners[o]&&giftCommunitySubHandler(o,n,s,i)}),t.onCommunityPayForward((e,t,n,s)=>{console.log("----- COMMUNITY PAY FORWARD -----"),console.log(n),console.log("---------------------")}),t.onStandardPayForward((e,t,n,s)=>{console.log("----- STANDARD PAY FORWARD -----"),console.log(n),console.log("---------------------")}),t.onPrimeCommunityGift((e,t,n,s)=>{console.log("----- PRIME COMMUNITY GIFT -----"),console.log(n),console.log("---------------------")}),t.onSubExtend((e,t,n,s)=>{console.log("----- SUB EXTEND -----"),console.log(n),console.log("---------------------")}),t.onSubGift((e,t,n,s)=>{console.log("------- SUB GIFT -------"),console.log(n),console.log("-------------------");let o=e.substr(1).toLowerCase(),i=n.gifterGiftCount;0===n.gifterGiftCount?awardRecipient(o,n,s):giftSubListeners[e]&&giftSubHandler(o,n,s,i)}),t.onBitsBadgeUpgrade((e,t,n,s)=>{console.log("------- BIT BADGE -------"),console.log(n),console.log("-------------------"),console.log(s)}),t.onDisconnect((e,t)=>{console.log(">>> CHATCLIENT DISCONNECTED <<<"),e&&console.log(">>> ChatClient was disconnected manually"),console.log(t)});let n="twitchClient"+Object.keys(clientConnections).length;return clientConnections[n]={id:n,client:t,connections:0},clientConnections[n]};(async()=>{let e=await axios.get(process.env.API_DOMAIN+"/api/irc/init"),t=async e=>{let t,s=!0,o=0;for(;s;){let i={limit:50,offset:o,total:t};e&&(i.channels=e);let c=await axios.get(process.env.API_DOMAIN+"/api/irc/listeners",{params:i,withCredentials:!0});c.data.listeners.forEach(e=>{n(e,"add")}),t=c.data.total,c.data.offset?o=c.data.offset:s=!1}console.log("> listeners retrieved")},n=(e,t)=>{let n,s=e.channel;if("add"===t)switch(e.achType){case"0":subListeners[s]=subListeners[s]||[],subListeners[s].push(e);break;case"1":resubListeners[s]=resubListeners[s]||[],resubListeners[s].push(e);break;case"2":giftSubListeners[s]=giftSubListeners[s]||[],giftSubListeners[s].push(e);break;case"3":raidListeners[s]=e;break;case"4":n=e.bot.toLowerCase(),chatListeners[s]=chatListeners[s]||{},chatListeners[s][n]=chatListeners[s][n]||[];let t=build(e.query);e.query=t;try{e.condition=getCondition(e.condition),chatListeners[s][n].push(e)}catch(t){console.log("Issue with loading condition for "+e.achievement)}break;case"5":if(followListeners[s]=e,e.bot){n=e.bot.toLowerCase(),chatListeners[s]=chatListeners[s]||{},chatListeners[s][n]=chatListeners[s][n]||[];let t=build(e.query);e.query=t;try{e.condition=getCondition(e.condition),chatListeners[s][n].push(e)}catch(t){console.log("Issue with loading condition for "+e.achievement)}}break;case"6":donationListeners[s]=e;break;case"7":bitsListeners[s]=e}else if("update"===t)switch(e.achType){case"0":if(subListeners[s]=subListeners[s]||[],0===subListeners[s].length)subListeners[s].push(e);else{let t=subListeners[s].findIndex(t=>t.achievement===e.achievement);subListeners[s].splice(t,1,e)}break;case"1":if(resubListeners[s]=resubListeners[s]||[],0===resubListeners[s].length)resubListeners[s].push(e);else{let t=resubListeners[s].findIndex(t=>t.achievement===e.achievement);resubListeners[s].splice(t,1,e)}break;case"2":if(giftSubListeners[s]=giftSubListeners[s]||[],0===giftSubListeners[s].length)giftSubListeners[s].push(e);else{let t=giftSubListeners[s].findIndex(t=>t.achievement===e.achievement);giftSubListeners[s].splice(t,1,e)}break;case"3":raidListeners[s]=e;break;case"4":n=e.bot.toLowerCase(),chatListeners[s]=chatListeners[s]||{},chatListeners[s][n]=chatListeners[s][n]||[];let t=build(e.query);e.query=t;try{if(e.condition=getCondition(e.condition),0===chatListeners[s][n].length)chatListeners[s][n].push(e);else{let t=chatListeners[s][n].findIndex(t=>(console.log(t.achievement,e.achievement),t.achievement===e.achievement));console.log("index: "+t),chatListeners[s][n].splice(t,1,e),console.log(chatListeners[s][n][t])}}catch(t){console.log("Issue with loading condition for "+e.achievement)}break;case"5":followListeners[s]=e;break;case"6":donationListeners[s]=e;break;case"7":bitsListeners[s]=e}else if("remove"===t)switch(e.achType){case"0":if(subListeners[s]&&subListeners[s].length>0){let t=subListeners[s].findIndex(t=>t.achievement===e.achievement);subListeners[s].splice(t,1)}break;case"1":if(query=e.query,resubListeners[s]&&resubListeners[s].length>0){let t=resubListeners[s].findIndex(t=>t.achievement===e.achievement);resubListeners[s].splice(t,1)}break;case"2":if(query=e.query,giftSubListeners[s]&&giftSubListeners[s].length>0){let t=giftSubListeners[s].findIndex(t=>t.achievement===e.achievement);giftSubListeners[s].splice(t,1)}break;case"3":delete raidListeners[s];break;case"4":if(n=e.bot.toLowerCase(),chatListeners[s]&chatListeners[s][n]&&chatListeners[s][n].length>0){let t=chatListeners[s][n].findIndex(t=>t.achievement===e.achievement);chatListeners[s][n].splice(t,1)}break;case"5":delete followListeners[s];break;case"6":delete donationListeners[s];break;case"7":delete bitsListeners[s]}};e.data&&e.data.at&&e.data.rt?(IRCAT=cryptr.decrypt(e.data.at),IRCRT=cryptr.decrypt(e.data.rt),IRCEXPIRES=e.data.expires_in,(()=>new Promise((e,c)=>{(socket=io.connect(process.env.SOCKET_DOMAIN,{reconnection:!0})).emit("handshake",{name:"SAIRC"}),socket.on("new-channel",e=>{console.log("-------------------------------"),console.log("["+e.name+"] New channel created!"),console.log("-------------------------------"),channelStatus[e.name]={name:e.name,"full-access":e["full-access"],connected:!1},s(e.name)}),socket.on("channel-update",e=>{console.log("-------------------------------"),console.log("["+e.old+"] has updated their channel name to "+e.new),console.log("-------------------------------"),e.old&&e.new?(channelStatus[e.old]&&channelStatus[e.old].connected&&o(e.old),channelStatus[e.new]={name:e.new,"full-access":e.fullAccess,connected:!1},s(e.new),t([e.new])):(console.log("Something went wrong with channel update, check logs"),console.log(e))}),socket.on("new-listener",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] Adding listener for "+e.achievement),console.log("-------------------------------"),n(e,"add")}),socket.on("update-listener",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] Updating listener for "+e.achievement),console.log("-------------------------------"),n(e,"update")}),socket.on("remove-listener",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] Removing listener for "+e.achievement),console.log("-------------------------------"),n(e,"remove")}),socket.on("become-gold",e=>{console.log("-------------------------------"),console.log("["+e+"] just gained gold status!"),console.log("-------------------------------"),channelStatus[e]&&(channelStatus[e]["full-access"]=!0)}),socket.on("remove-gold",e=>{console.log("-------------------------------"),console.log("["+e+"] just lost gold status!"),console.log("-------------------------------"),channelStatus[e]&&(channelStatus[e]["full-access"]=!1)}),socket.on("connect-bot",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] just connected "+e.bot+"!"),console.log("-------------------------------"),i(e.channel,e)}),socket.on("disconnect-bot",e=>{console.log("-------------------------------"),console.log("["+e.channel+"] just disconnected "+e.bot+"!"),console.log("-------------------------------");let{channel:t,bot:n}=e;if(connectedBots[t]&&connectedBots[t][n]){let s=connectedBots[t][n],o=s.id;console.log(">>> disconnect-bot: "+e.channel+": "+e.bot),s.close(),delete connectedBots[t][n],delete socketLookup[o]}}),socket.on("delete-channel",e=>{channelStatus[e]&&channelStatus[e].connected&&o(e)}),socket.on("achievement-awarded",e=>{debugLog(JSON.stringify(e));let{channel:t,message:n}=e,s=channelStatus[t].clientID;console.log("sending to "+s),clientConnections[s].client.say(t,n)}),socket.on("achievement-awarded-nonMember",e=>{debugLog(JSON.stringify(e));let{channel:t,message:n}=e,s=channelStatus[t].clientID;console.log("sending to "+s),clientConnections[s].client.say(t,n)}),socket.on("retrieve-listeners",e=>{let t={};t.follow=followListeners[e],t.donation=donationListeners[e],t.bits=bitsListeners[e],t.sub=subListeners[e],t.resub=resubListeners[e],t.gift=giftSubListeners[e],t.raid=raidListeners[e],t.chat=chatListeners[e],socket.emit("listeners-retrieved",JSON.stringify(t))}),e()}))().then(()=>{console.log("==========================="),console.log("   IRC IS UP AND RUNNING   "),console.log("==========================="),console.log("\n"),(async()=>{let e,t=!0,n=0;for(;t;){let s=await axios.get(process.env.API_DOMAIN+"/api/irc/channels",{params:{limit:50,offset:n,total:e},withCredentials:!0});s.data.channels.forEach(e=>{channelStatus[e.name]={name:e.name,"full-access":e["full-access"],connected:!1,bot:e.bot||!1}}),e=s.data.total,s.data.offset?n=s.data.offset:(t=!1,l())}})(),t(),setInterval(r,1e4)})):console.log(">>> ERROR RETRIEVING IRC DATA FROM SERVER");let s=async(e,t)=>{let n;t&&(channelStatus[e]=channelStatus[t],channelStatus[e].name=e,delete channelStatus[t]);let s=Object.keys(clientConnections);for(var o=0;o<s.length;o++)if(console.log(clientConnections[s[o]].connections),clientConnections[s[o]].connections<50){n=clientConnections[s[o]];break}void 0===n&&(n=await createClientConnection());try{await n.client.join(e);console.log("*************************"),console.log(">>> STREAM ACHIEVEMENTS IS WATCHING "+e),channelStatus[e].bot&&i(e,channelStatus[e].bot,!0),console.log("*************************"),channelStatus[e].connected=!0,n.connections=n.connections+1,channelStatus[e].clientID=n.id}catch(t){console.log("[33m%s[0m","issue joining "+e+"'s channel"),failedToConnect.push(e)}},o=e=>{console.log(">>> disconnectFromStream: "+e);let t=channelStatus[e].clientID,n=clientConnections[t];if(n.client.part("#"+e),delete followListeners[e],delete donationListeners[e],delete bitsListeners[e],delete subListeners[e],delete resubListeners[e],delete giftSubListeners[e],delete raidListeners[e],delete chatListeners[e],connectedBots[e]){Object.keys(connectedBots[e]).forEach(t=>{let n=connectedBots[e][t],s=n.id;console.log(">>> closing socket for bot: "+t),n.close(),delete connectedBots[e][t],delete socketLookup[s]})}delete channelStatus[e],n.connections=n.connections-1,console.log("*************************"),console.log(`>>> ${e} has deleted their channel!`),console.log("*************************")},i=(e,t,n)=>{let{st:s,bot:o}=t,i=cryptr.decrypt(s),l=io.connect("https://sockets.streamlabs.com?token="+i,{reconnection:!0}),r=`>>> ${e} is now connected to ${o}`;n?console.log(r):(console.log("*************************"),console.log(r),console.log("*************************")),l.SAID=uuid(),c(e,l),socketLookup[l.SAID]=e,connectedBots[e]||(connectedBots[e]={}),connectedBots[e][o]=l},c=(e,t)=>{t.on("event",e=>{let n=socketLookup[t.SAID];if("donation"===e.type)donationHandler(n,e.message);else if("twitch_account"===e.for)switch(e.type){case"follow":newFollowHandler(n,e.message);break;case"bits":bitsHandler(n,e.message)}})},l=async()=>{let e=Object.keys(channelStatus);e.length>0&&async function(e,t){for(let n=0;n<e.length;n++)await t(e[n],n,e)}(e,async e=>{let t=e.toLowerCase();await s(t)}),setTimeout(()=>{failedToConnect.length>0&&axios({method:"post",url:process.env.API_DOMAIN+"/api/channel/update",data:failedToConnect}).then(e=>{e.data.updatedChannels&&(e.data.updatedChannels.forEach(e=>{let t=e.new.toLowerCase();s(t,e.old)}),t(e.data.updatedChannels.map(e=>e.new)))})},2e4);let n=failedToConnect.length>0;for(;n;){let e=failedToConnect.splice(0,failedToConnect.length);setTimeout(()=>{e.forEach(s)},5e3),n=failedToConnect.length>0}},r=()=>{if(requestQueue.length>0){let e=requestQueue.slice(0);requestQueue.splice(0,requestQueue.length),console.log("\nSending "+e.length+" achievements..."),console.log(e),axios({method:"post",url:process.env.API_DOMAIN+"/api/achievement/listeners",data:e})}}})()},function(e,t){e.exports=require("fs")},function(e,t){e.exports=require("twitch")},function(e,t){e.exports=require("twitch-chat-client")},function(e,t){e.exports=require("cryptr")},function(e,t){e.exports=require("uuid/v1")},function(e,t){e.exports=require("axios")},function(e,t){e.exports=require("socket.io-client")},function(e,t){let n={"{user}":/(?<user>[a-zA-Z0-9_]+)/,"{target}":/(?<target>[a-zA-Z0-9_]+)/,"{amount}":/(?<amount>[0-9,\.]+)/,"{total}":/(?<total>[0-9,\.]+)/,"{time}":/(?<time>[0-9,\.\s]+)/,"{ignore}":/(?<ignore>.+)/,"{followage}":/(?<followage>[1-9]+\s(second[s]*|minute[s]*|day[s]*|week[s]*|month[s]*|year[s]*).*)/};e.exports={build:e=>{let t=Object.keys(n),s=e;return s=(e=>e.replace(/[.*+?^$()|[\]\\]/g,"\\$&"))(s),t.forEach(e=>{s=s.replace(new RegExp(e,"gi"),n[e].source)}),s},getCondition:e=>{if(""===e||void 0===e)return"occured";{let t=new RegExp(/(?<condition>[a-zA-Z0-9_]+)(?<operator>[=<>]+)(?<solution>[a-zA-Z0-9_,\.]+)/),n=e.match(t);return n.groups?n.groups:(console.log("error getting condition for the following: "+e),"error")}}}}]);