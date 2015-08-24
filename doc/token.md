
Token string structure
======================

<unique-random-id>-<token-duration>-<token-creation-timestamp>



Token storage
=============

User: {
	isApiKey: if true, the 'login' field is an API key and it can replaces a token
	login: 
	passwordHash: 
	token: {
		14ef5ab98c41: {
			type: header|cookie|queryString|urlAuth|basicAuth
			creationTime:
			expirationTime:
			lastUseTime?
			agentId:
		}
	}
}



Token creation
==============

POST /Users/CreateToken
{
	type: header|cookie|queryString|urlAuth|basicAuth
	login: 
	password: 
	agentId: 
}

response:
{
	userId: 2354a43b5f
	token: 861cd6fe1
}



Token usage
===========

Header
------

X-Token: 861cd6fe1



Cookie
------

token: 861cd6fe1



Query string
------------

https://api.example.com/path/to/resource?token=861cd6fe1



URL Auth
--------

https://2354a43b5f@api.example.com/path/to/resource



Basic Auth
----------

Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==


