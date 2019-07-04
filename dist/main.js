!function(e){var t={};function n(s){if(t[s])return t[s].exports;var r=t[s]={i:s,l:!1,exports:{}};return e[s].call(r.exports,r,r.exports,n),r.l=!0,r.exports}n.m=e,n.c=t,n.d=function(e,t,s){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:s})},n.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.t=function(e,t){if(1&t&&(e=n(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var s=Object.create(null);if(n.r(s),Object.defineProperty(s,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var r in e)n.d(s,r,function(t){return e[t]}.bind(null,r));return s},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="",n(n.s=0)}([function(e,t,n){e.exports=n(1)},function(module,exports,__webpack_require__){const TwitchJS=__webpack_require__(2).default,axios=__webpack_require__(3),io=__webpack_require__(4),token=process.env.TKN,username=process.env.UN,client_id=process.env.CID,{build:build,getCondition:getCondition}=__webpack_require__(5),{chat:chat,chatConstants:chatConstants}=new TwitchJS({token:token,username:username}),port=process.env.PORT||5e3;let channels=[],socket,channelStatus={},subListeners={},resubListeners={},giftSubListeners={},raidListeners={},chatListeners={},requestQueue=[],failedToConnect=[],newSubHandler=(e,t)=>{let n={channel:e,achievementID:subListeners[e].achievement,tier:t.parameters.subPlan,userID:t.tags.userId};requestQueue.push(n)},resubHandler=(e,t)=>{let{cumulativeMonths:n,streakMonths:s,subPlan:r}=t.parameters;resubListeners[e].forEach(a=>{if("0"===a.resubType&&Number.parseInt(a.condition)<=s){let n={channel:e,type:t.tags.msgId,tier:r,userID:t.tags.userId,achievementID:a.achievement,streak:s};requestQueue.push(n)}else if("1"===a.resubType&&Number.parseInt(a.condition)<=n){let s={channel:e,type:t.tags.msgId,tier:r,userID:t.tags.userId,achievementID:a.achievement,cumulative:n};requestQueue.push(s)}})},giftSubHandler=(e,t,n)=>{let s=giftSubListeners[e],{months:r,recipientId:a,subPlan:o}=t.parameters;s.forEach(s=>{if(s.condition<=n){let n={channel:e,achievementID:s.achievement,type:t.tags.msgId,gifterID:t.tags.userId,tier:o};if(requestQueue.push(n),r>1)console.log("got some resub listeners, check them..."),resubListeners[e]&&(console.log(e+" has listeners..."),resubListeners[e].forEach(n=>{if("1"===n.resubType&&Number.parseInt(n.condition)<=r){let s={channel:e,type:"resub",tier:o,userID:t.tags.userId,achievementID:n.achievement,cumulative:r};requestQueue.push(s)}}));else if(subListeners[e]){let t={channel:e,achievementID:subListeners[e].achievement,tier:o,userID:a};requestQueue.push(t)}}})},raidHandler=e=>{let t=raidListeners[channel],n={channel:channel,achievementID:t,type:e.tags.msgId,userID:e.tags.userId};requestQueue.push(n)},chatHandler=(channel,msg,username)=>{if(channelStatus[channel]["full-access"]&&chatListeners[channel]){let listeners=chatListeners[channel][username];listeners&&(console.log("we have listeners..."),listeners.forEach(listener=>{let regex=new RegExp(listener.query),matches=msg.match(regex);if(matches){let match=!0;console.log(matches.groups);let userValue=matches.groups.value,user=matches.groups.user,{condition:condition,operator:operator,value:value}=listener.condition;if("="===operator&&(operator="==="),eval(userValue+operator+value)){console.log("ACHIEVEMENT EARNED");let e={channel:channel,achievementID:listener.achievement,user:user};requestQueue.push(e)}}}))}};chat.connect(),chat.on("PRIVMSG",e=>{chatHandler(e.channel.substr(1),e.message,e.username)}),chat.on("NOTICE/HOST_ON",e=>{let t=e.channel.substr(1).toLowerCase();channelStatus[t]&&channelStatus[t].online&&(channelStatus[t].online=!1)}),chat.on("USERNOTICE/SUBSCRIPTION",e=>{let t=e.channel.substr(1);subListeners[t]&&newSubHandler(t,e),console.log("------- SUB -------"),console.log(e),console.log("-------------------")}),chat.on("USERNOTICE/RESUBSCRIPTION",e=>{let t=e.channel.substr(1);resubListeners[t]&&resubHandler(t,e),console.log(resubListeners[t]),console.log("------- SUB -------"),console.log(e),console.log("-------------------")}),chat.on("USERNOTICE/SUBSCRIPTION_GIFT",e=>{let t=e.channel.substr(1);totalGifts=e.parameters.senderCount,giftSubListeners[t]&&giftSubListeners[t][totalGifts]&&giftSubHandler(t,e,totalGifts),console.log("------- SUB GIFT -------"),console.log(e),console.log("-------------------")}),chat.on("USERNOTICE/SUBSCRIPTION_GIFT_COMMUNITY",e=>{e.channel.substr(1);console.log("------- SUB GIFT COMMUNITY -------"),console.log(e),console.log("-------------------")}),chat.on("USERNOTICE/RAID",e=>{let t=e.channel.substr(1);raidListeners[t]&&raidHandler(t,e),console.log("------- RAID -------"),console.log(e),console.log("-------------------")});let retrieveActiveChannels=async()=>{let e,t=!0,n=0;for(;t;){let s=await axios.get(process.env.API_DOMAIN+"/api/irc/channels",{params:{limit:50,offset:n,total:e},withCredentials:!0});s.data.channels.forEach(e=>{channelStatus[e.name]={name:e.name,"full-access":e["full-access"],online:!1}}),e=s.data.total,s.data.offset?n=s.data.offset:t=!1}console.log("channels retrieved"),console.log(channelStatus)},retrieveChannelListeners=async()=>{let e,t=!0,n=0;for(;t;){let s=await axios.get(process.env.API_DOMAIN+"/api/irc/listeners",{params:{limit:50,offset:n,total:e},withCredentials:!0});s.data.listeners.forEach(e=>{listenerHandler(e,"add")}),e=s.data.total,s.data.offset?n=s.data.offset:t=!1}console.log("listeners retrieved")},listenerHandler=(e,t)=>{let n,s=e.channel;if("add"===t)switch(e.achType){case"0":subListeners[s]=e,console.log(e);break;case"1":resubListeners[s]=resubListeners[s]||[],resubListeners[s].push(e),console.log(e);break;case"2":giftSubListeners[s]=giftSubListeners[s]||[],giftSubListeners[s].push(e),console.log(e);break;case"3":raidListeners[s]=e;break;case"4":n=e.bot,chatListeners[s]=chatListeners[s]||{},chatListeners[s][n]=chatListeners[s][n]||[];let t=build(e.query);e.query=t,e.condition=getCondition(e.condition),console.log(e),chatListeners[s][n].push(e)}else if("update"===t)switch(e.achType){case"0":subListeners[s]=e;break;case"1":if(resubListeners[s]=resubListeners[s]||[],0===resubListeners[s].length)resubListeners[s].push(e);else{let t=resubListeners[s].findIndex(t=>{t.id,e.id});resubListeners[s].splice(t,1,e)}break;case"2":if(giftSubListeners[s]=giftSubListeners[s]||[],0===giftSubListeners[s].length)giftSubListeners[s].push(e);else{let t=giftSubListeners[s].findIndex(t=>{t.id,e.id});giftSubListeners[s].splice(t,1,e)}break;case"3":raidListeners[s]=e;break;case"4":n=e.bot,chatListeners[s]=chatListeners[s]||{},chatListeners[s][n]=chatListeners[s][n]||[];let t=build(e.query);if(e.query=t,0===chatListeners[s][n].length)chatListeners[s][n].push(e);else{let t=chatListeners[s][n].findIndex(t=>{t.id,e.id});chatListeners[s][n].splice(t,1,e)}}else if("remove"===t)switch(e.achType){case"0":delete subListeners[s];break;case"1":if(resubType=e.resubType,query=e.query,resubListeners[s]&&resubListeners[s].length>0){let t=resubListeners[s].findIndex(t=>{t.id,e.id});resubListeners[s].splice(t,1)}break;case"2":if(query=e.query,giftSubListeners[s]&&giftSubListeners[s].length>0){let t=giftSubListeners[s].findIndex(t=>{t.id,e.id});giftSubListeners[s].splice(t,1)}break;case"3":delete raidListeners[s];break;case"4":if(n=e.bot,chatListeners[s]&chatListeners[s][n]&&chatListeners[s][n].length>0){let t=chatListeners[s][n].findIndex(t=>{t.id,e.id});chatListeners[s][n].splice(t,1)}}},setup=()=>new Promise((e,t)=>{(socket=io.connect(process.env.API_DOMAIN,{reconnection:!0})).emit("handshake",{name:"SAIRC"}),socket.on("new-channel",e=>{channelStatus[e.name]={name:e.name,"full-access":e["full-access"],online:!1}}),socket.on("new-listener",e=>{console.log("new-listener"),listenerHandler(e,"add")}),socket.on("update-listener",e=>{console.log("update-listener"),listenerHandler(e,"update")}),socket.on("remove-listener",e=>{console.log("remove-listener"),listenerHandler(e,"remove")}),socket.on("become-gold",e=>{channelStatus[e]["full-access"]=!0}),socket.on("remove-gold",e=>{channelStatus[e]["full-access"]=!1}),socket.on("test",e=>{console.log(e),chatHandler(e.channel,e.message,e.username)}),socket.on("achievement-awarded",e=>{chat.whisper(e.channel,`${e.member} just earned the "${e.achievement}" achievement!`)}),socket.on("achievement-awarded-nonMember",e=>{chat.whisper(e.channel,`${e.member} just earned the "${e.achievement}" achievement!`)}),e()});setup().then(()=>{console.log("==========================="),console.log("   IRC IS UP AND RUNNING   "),console.log("==========================="),console.log("\n"),console.log("Channels to watch: "+channels.length),console.log("\n"),retrieveActiveChannels(),retrieveChannelListeners(),console.log("check for live channels"),channelLiveWatcher()});let connectToStream=e=>{chat.connect().then(t=>{chat.join(e).then(t=>{console.log("*************************"),console.log(">>> STREAM ACHIEVEMENTS IS WATCHING "+e),console.log("*************************"),console.log("Setting "+e+" to true"),channelStatus[e].online=!0}).catch(t=>{console.log("[33m%s[0m","issue joining channel"),failedToConnect.push(e)})}).catch(t=>{failedToConnect.push(e),console.log("[33m%s[0m","issue connecting to chat")})},channelLiveWatcher=async()=>{let e=Object.keys(channelStatus).filter(e=>!channelStatus[e].online);console.log(e);let t=0,n=!0;for(;n;){let s=await axios.get("https://api.twitch.tv/kraken/streams/",{params:{client_id:client_id,channel:e.join(),limit:50,offset:t}}),r=s.data.streams;r.length>0?(r.forEach(e=>{let t=e.channel.display_name.toLowerCase();connectToStream(t)}),s.data._links.next?t+=50:n=!1):(console.log("No streams online"),n=!1)}let s=failedToConnect.length>0;for(;s;){let e=failedToConnect.splice(0,failedToConnect.length);setTimeout(()=>{e.forEach(connectToStream)},5e3),s=failedToConnect.length>0}},sendAchievements=()=>{if(requestQueue.length>0){let e=requestQueue.slice(0);requestQueue.splice(0,requestQueue.length),console.log("Sending "+e.length+" achievements..."),axios({method:"post",url:process.env.API_DOMAIN+"/api/achievement/listeners",data:e})}};setInterval(channelLiveWatcher,12e4),setInterval(sendAchievements,1e4)},function(e,t){e.exports=require("twitch-js")},function(e,t){e.exports=require("axios")},function(e,t){e.exports=require("socket.io-client")},function(e,t){let n={"{user}":/(?<user>[a-zA-Z0-9_]+)/,"{target}":/(?<target>[a-zA-Z0-9_]+)/,"{value}":/(?<value>[0-9]+)/};e.exports={build:e=>{let t=Object.keys(n),s=e;return t.forEach(e=>{s=s.replace(new RegExp(e,"gi"),n[e].source)}),s},getCondition:e=>{if(""===e)return{condition:"occured"};{console.log(e);let t=new RegExp(/(?<condition>[a-zA-Z0-9_]+)(?<operator>[=<>]+)(?<value>[0-9]+)/);return e.match(t).groups}}}}]);