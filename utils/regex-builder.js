

let legend = {
	'{user}': /(?<user>[a-zA-Z0-9_]+)/,
	'{target}': /(?<target>[a-zA-Z0-9_]+)/,
	'{amount}': /(?<amount>[0-9,\.]+)/,
	'{total}': /(?<total>[0-9,\.]+)/,
	'{time}': /(?<time>[0-9,\.]+)/
};

let build = (data) => {
	let replacements = Object.keys(legend);
    let query = data;
    replacements.forEach(key => {
        query = query.replace(new RegExp(key, 'gi'), legend[key].source);
    });

    return query;
};

let getCondition = (data) => {

	if(data === "") {
		//No specific value, reward based on chat message occuring
		return 'occured';
	} else {
		let regex = new RegExp(/(?<condition>[a-zA-Z0-9_]+)(?<operator>[=<>]+)(?<solution>[a-zA-Z0-9_]+)/);
		
		let match = data.match(regex);

		if(match.groups) {
			return match.groups;
		} else {
			console.log('error getting condition for the following: ' + data);
			return 'error'
		}
	}

	
}

let escape = (s) => {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = {
	build,
	getCondition
}

/*
	- Username of achievement earner
	- Username of target
	- Value
	- Count
*/