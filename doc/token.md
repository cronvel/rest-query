
Token storage
=============

User: {
	isApiKey: if true, the 'login' field is an API key and it can replaces a token
	login: 
	passwordHash: 
	token: {
		14ef5ab98c41: {
			by: header|cookie|queryString|urlAuth|basicAuth
			creationTime:
			lastUseTime:
			agentId:
		}
	}
}



Token creation
==============

POST /Users/CreateToken
{
	by: header|cookie|queryString|urlAuth|basicAuth
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

X-User-Id: 2354a43b5f
X-Token: 861cd6fe1



Cookie
------

userId: 2354a43b5f
token: 861cd6fe1



Query string
------------

https://api.example.com/path/to/resource?userId=2354a43b5f&token=861cd6fe1



URL Auth
--------

https://2354a43b5f:861cd6fe1@api.example.com/path/to/resource?userId=2354a43b5f&token=861cd6fe1



Basic Auth
----------

Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==


