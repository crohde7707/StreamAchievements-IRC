!function(e){var t={};function n(o){if(t[o])return t[o].exports;var s=t[o]={i:o,l:!1,exports:{}};return e[o].call(s.exports,s,s.exports,n),s.l=!0,s.exports}n.m=e,n.c=t,n.d=function(e,t,o){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:o})},n.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.t=function(e,t){if(1&t&&(e=n(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var o=Object.create(null);if(n.r(o),Object.defineProperty(o,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var s in e)n.d(o,s,function(t){return e[t]}.bind(null,s));return o},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="",n(n.s=0)}([function(e,t,n){e.exports=n(1)},function(e,t,n){const o=n(2).default,s=n(3),l=n(4),r=n(5),c=s.phirebot.token,a=s.phirebot.username,{chat:u,chatConstants:i}=(s.twitch.clientID,n(6).build,new o({token:c,username:a}));let p,I=[],g={},h={},f={},m={},d={},b=[],v=e=>{let t=m[channel],n={channel:channel,achievementID:t,type:e.tags.msgId,userID:e.tags.userId};b.push(n)};u.connect().then(e=>{}),u.on("*",e=>{}),u.on("PRIVMSG",e=>{((e,t,n)=>{if(d[e]){let o=d[e][n];o&&(console.log("we have listeners..."),o.forEach(e=>{let n=new RegExp(e.query);console.log(t);let o=t.match(n);o&&console.log(o)}))}})(e.channel.substr(1),e.message,e.username)}),u.on("USERNOTICE/SUBSCRIPTION",e=>{let t=e.channel.substr(1);g[t]&&((e,t)=>{let n={channel:e,achievementID:g[e],tier:t.parameters.subPlan,userID:t.tags.userId};b.push(n)})(t,e),console.log("------- SUB -------"),console.log(e),console.log("-------------------")}),u.on("USERNOTICE/RESUBSCRIPTION",e=>{let t=e.channel.substr(1);h[t]&&((e,t)=>{let{cumulativeMonths:n,streakMonths:o,subPlan:s}=t.parameters;h[e].forEach(l=>{if(console.log(l),console.log("streakMonths: "+o),console.log("cumulativeMonths: "+n),0===l.type&&Number.parseInt(l.query)<=o){console.log("  >>> Achievmenet earned: streak");let n={channel:e,type:t.tags.msgId,tier:s,userID:t.tags.userId,achievementID:l,streak:o};b.push(n)}else if(1===l.type&&Number.parseInt(l.query)<=n){console.log("  >>> Achievmenet earned: cumulativeMonths");let o={channel:e,type:t.tags.msgId,tier:s,userID:t.tags.userId,achievementID:l,cumulative:n};b.push(o)}})})(t,e),console.log(h[t]),console.log("------- SUB -------"),console.log(e),console.log("-------------------")}),u.on("USERNOTICE/SUBSCRIPTION_GIFT",e=>{let t=e.channel.substr(1);totalGifts=e.parameters.senderCount,f[t]&&f[t][totalGifts]&&((e,t,n)=>{let o=f[e][n],{months:s,recepientID:l,subPlan:r}=t.parameters,c={channel:e,achievementID:o,type:t.tags.msgId,gifterID:t.tags.userId,recepientID:recipientId,recepientTotalMonths:s,tier:r};b.push(c)})(t,e,totalGifts),console.log("------- SUB GIFT -------"),console.log(e),console.log("-------------------")}),u.on("USERNOTICE/SUBSCRIPTION_GIFT_COMMUNITY",e=>{e.channel.substr(1);console.log("------- SUB GIFT COMMUNITY -------"),console.log(e),console.log("-------------------")}),u.on("USERNOTICE/RAID",e=>{let t=e.channel.substr(1);m[t]&&v(t),console.log("------- RAID -------"),console.log(e),console.log("-------------------")});(()=>new Promise((e,t)=>{(p=r.connect(process.env.API_DOMAIN+":"+process.env.API_WS_PORT,{reconnection:!0}).catch(e=>{console.log("Failed to connect to websocket at "+process.env.API_DOMAIN+":"+process.env.API_WS_PORT)})).on("new-channel",e=>console.log(e)),l.get(process.env.API_DOMAIN,{}).then(t=>{I=t.channels,e()})}))().then(()=>{console.log("==========================="),console.log("   IRC IS UP AND RUNNING   "),console.log("===========================")})},function(e,t){e.exports=require("twitch-js")},function(e,t){e.exports={twitch:{clientID:"zx83pxp0b4mkeu931upd21a6f9clv4",clientSecret:"zzagacb4su7w9yaxym6d5b3l86hyne"},session:{cookieKey:"tacosarelovetacosarelyfe"},phirebot:{token:"oauth:poux5p75u6q7nymldu2c4s7vtijiuj",username:"stream_achievements"}}},function(e,t){e.exports=require("axios")},function(e,t){e.exports=require("socket.io-client")},function(e,t){let n={"{user}":/([a-zA-Z0-9_]+)/,"{target}":/([a-zA-Z0-9_]+)/,"{value}":/([0-9]+)/};e.exports={build:e=>{let t=Object.keys(n),o=e;return t.forEach(e=>{o=o.replace(new RegExp(e,"gi"),n[e].source)}),o}}}]);