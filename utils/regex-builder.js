

let legend = {
	'{user}': /(?<user>[a-zA-Z0-9_]+)/,
	'{target}': /(?<target>[a-zA-Z0-9_]+)/,
	'{value}': /(?<value>[0-9]+)/
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
		return {
			condition: 'occured'
		}
	} else {
		console.log(data);
		let regex = new RegExp(/(?<condition>[a-zA-Z0-9_]+)(?<operator>[=<>])(?<value>[0-9]+)/);
		
		return data.match(regex).groups;	
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