/*
	Rest Query

	Copyright (c) 2014 - 2019 Cédric Ronvel

	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/

"use strict" ;



const restQuery = require( './restQuery.js' ) ;

const Promise = require( 'seventh' ) ;

const crypto = require( 'crypto' ) ;

const ErrorStatus = require( 'error-status' ) ;
const doormen = require( 'doormen' ) ;
const hash = require( 'hash-kit' ) ;
const tree = require( 'tree-kit' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;



/* UsersCollectionNode */



function UsersCollectionNode( app , schema ) {
	doormen( UsersCollectionNode.schemaSchema , schema ) ;

	if ( schema.properties.login && typeof schema.properties.login === 'object' ) {
		tree.extend( { deep: true } , schema.properties.login , {
			type: 'string' ,
			system: true ,
			tags: [ 'id' ]
		} ) ;
	}
	else {
		schema.properties.login = {
			type: 'string' ,
			system: true ,
			tags: [ 'id' ]
		} ;
	}

	schema.properties.password = {
		optional: true ,
		system: true ,
		type: 'strictObject' ,
		tags: [ 'system' ] ,
		noSubmasking: true ,
		properties: {
			hash: { type: 'string' } ,
			algo: { type: 'string' , default: 'sha512' } ,
			salt: { type: 'string' , default: '' }
		}
	} ;

	schema.properties.groups = {
		type: 'backLink' ,
		system: true ,
		collection: 'groups' ,
		path: 'users' ,
		tags: [ 'member' ]
	} ;

	schema.properties.token = {
		type: 'strictObject' ,
		system: true ,
		tags: [ 'system' ] ,
		noSubmasking: true ,
		default: {} ,
		of: {
			type: 'strictObject' ,
			properties: {
				type: { in: [ 'header' , 'cookie' , 'queryString' , 'urlAuth' , 'basicAuth' , 'web' ] } ,
				//type: tokenTypeSchema ,
				//acceptAuthType: tokenAcceptAuthTypeSchema ,
				agentId: { type: 'string' } ,
				creationTime: { type: 'number' } ,
				expirationTime: { type: 'number' } ,
				duration: { type: 'number' }
			}
		}
	} ;

	schema.properties.apiKeys = {
		type: 'array' ,
		system: true ,
		tags: [ 'system' ] ,
		noSubmasking: true ,
		default: [] ,
		of: { type: 'string' }
	} ;

	if ( schema.properties.hooks ) {
		schema.properties.hooks.properties.beforeCreateToken = restQuery.CollectionNode.restQueryHookSchema ;
		schema.properties.hooks.properties.afterCreateToken = restQuery.CollectionNode.restQueryHookSchema ;
		schema.properties.hooks.properties.beforeRegenerateToken = restQuery.CollectionNode.restQueryHookSchema ;
		schema.properties.hooks.properties.afterRegenerateToken = restQuery.CollectionNode.restQueryHookSchema ;
	}

	// One unique login among siblings
	restQuery.CollectionNode.ensureIndex( schema.indexes , { properties: { login: 1 , "parent.id": 1 } , unique: true } ) ;

	// Call the parent constructor
	restQuery.CollectionNode.call( this , app , 'users' , schema ) ;

	this.beforeCreateTokenHook = schema.hooks.beforeCreateToken && schema.hooks.beforeCreateToken.bind( app ) ;
	this.afterCreateTokenHook = schema.hooks.afterCreateToken && schema.hooks.afterCreateToken.bind( app ) ;
	this.beforeRegenerateTokenHook = schema.hooks.beforeRegenerateToken && schema.hooks.beforeRegenerateToken.bind( app ) ;
	this.afterRegenerateTokenHook = schema.hooks.afterRegenerateToken && schema.hooks.afterRegenerateToken.bind( app ) ;
	this.beforeCreateApiKeyHook = schema.hooks.beforeCreateApiKey && schema.hooks.beforeCreateApiKey.bind( app ) ;
	this.afterCreateApiKeyHook = schema.hooks.afterCreateApiKey && schema.hooks.afterCreateApiKey.bind( app ) ;

	// Add methods
	this.collectionMethods.createToken = UsersCollectionNode.prototype.createTokenMethod.bind( this ) ;
	this.collectionMethods.regenerateToken = UsersCollectionNode.prototype.regenerateTokenMethod.bind( this ) ;
	this.collectionMethods.revokeToken = UsersCollectionNode.prototype.revokeTokenMethod.bind( this ) ;
	this.collectionMethods.revokeAllTokens = UsersCollectionNode.prototype.revokeAllTokensMethod.bind( this ) ;
	this.collectionMethods.checkToken = UsersCollectionNode.prototype.checkTokenMethod.bind( this ) ;
	
	this.objectMethods.createApiKey = UsersCollectionNode.prototype.createApiKeyMethod.bind( this ) ;
	this.objectMethods.revokeApiKey = UsersCollectionNode.prototype.revokeApiKeyMethod.bind( this ) ;
	this.objectMethods.revokeAllApiKeys = UsersCollectionNode.prototype.revokeAllApiKeysMethod.bind( this ) ;
}

module.exports = UsersCollectionNode ;

UsersCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
UsersCollectionNode.prototype.constructor = UsersCollectionNode ;



// WIP...

UsersCollectionNode.schemaSchema = tree.extend(
	{ deep: true } ,
	{} ,
	restQuery.CollectionNode.schemaSchema ,
	{}
) ;



UsersCollectionNode.prototype.initDocument = function( incomingDocument ) {
	var passwordObject , error ;

	if ( typeof incomingDocument.password === 'string' ) {
		passwordObject = {
			algo: 'sha512' ,
			salt: hash.randomIdentifier( 10 )
		} ;

		passwordObject.hash = hash.password( incomingDocument.password , passwordObject.salt , passwordObject.algo ) ;

		incomingDocument.password = passwordObject ;
	}

	// Should it be solved userland?
	//if ( incomingDocument.slugId ) { incomingDocument.slugId = restQuery.slugify( incomingDocument.login ) ; }

	if ( incomingDocument.isApiKey ) {
		if ( ! incomingDocument.login ) {
			error = ErrorStatus.badRequest( "When 'isApiKey' is set, it should contain a 'login' properties" ) ;
			error.validatorMessage = error.message ;
			throw error ;
		}
	}
	else if ( ! incomingDocument.login || ! incomingDocument.password ) {
		//error = ErrorStatus.badRequest( "When 'isApiKey' is NOT set, it should contain a 'login' and 'password' properties" ) ;
		//console.error( incomingDocument ) ;
		error = new Error( "When 'isApiKey' is NOT set, it should contain a 'login' and 'password' properties" ) ;
		error.validatorMessage = error.message ;
		throw error ;
	}
} ;



UsersCollectionNode.prototype.initPatch = function( incomingPatch ) {
	var passwordObject ;

	if ( typeof incomingPatch.password === 'string' ) {
		passwordObject = {
			algo: 'sha512' ,
			salt: hash.randomIdentifier( 10 )
		} ;

		passwordObject.hash = hash.password( incomingPatch.password , passwordObject.salt , passwordObject.algo ) ;

		incomingPatch.password = passwordObject ;
	}
} ;



UsersCollectionNode.prototype.tokenGenerator = new restQuery.TokenGenerator( [
	{ key: 'expirationTime' , type: 'int' , length: 6 } ,	// in ms
	{ key: 'userId' , type: 'hex' , length: 12 } ,	// MongoId: 12 bytes, 24 hex chars
	{ key: 'agentId' , type: 'hex' , length: 5 } ,	// 10 hex chars
	// actually that can be dangerous, giving some informations to a hacker, it's best to give those 2 bytes to the security code
	//{ key: 'increment' , type: 'increment16' } ,
	{ key: 'securityCode' , type: 'hex' , length: 8 } ,
	{ key: 'typeCode' , type: 'BASE36' , length: 2 }
] ) ;



UsersCollectionNode.prototype.apiKeyGenerator = new restQuery.TokenGenerator( [
	{ key: 'securityCode' , type: 'hex' , length: 45 } ,
	{ key: 'userId' , type: 'hex' , length: 12 } ,	// MongoId: 12 bytes, 24 hex chars
	{ key: 'agentId' , type: 'hex' , length: 5 } ,	// 10 hex chars
	{ key: 'typeCode' , type: 'BASE36' , length: 2 }
] ) ;



var tokenType2Code = {
	header: 'H' ,
	cookie: 'CK' ,
	queryString: 'QS' ,
	urlAuth: 'UA' ,
	basicAuth: 'BA' ,
	web: 'W3'
} ;

var tokenCode2Type = {
	H: 'header' ,
	CK: 'cookie' ,
	QS: 'queryString' ,
	UA: 'urlAuth' ,
	BA: 'basicAuth' ,
	W3: 'web'
} ;



var createTokenSchema = {
	type: 'strictObject' ,
	properties: {
		type: { in: [ 'header' , 'cookie' , 'queryString' , 'urlAuth' , 'basicAuth' , 'web' ] } ,
		agentId: { type: 'hex' , length: 10 , default: "0000000000" } ,
		login: { type: 'string' } ,
		password: { type: 'string' } ,
		duration: { optional: true , type: 'integer' }
	}
} ;

var createApiKeySchema = {
	type: 'strictObject' ,
	properties: {
		type: { in: [ 'header' , 'cookie' , 'queryString' , 'urlAuth' , 'basicAuth' , 'web' ] } ,
		agentId: { type: 'hex' , length: 10 , default: "0000000000" }
	}
} ;



UsersCollectionNode.prototype.createTokenMethod = async function( context ) {
	var user , token , beforeContext , afterContext ;

	try {
		doormen( createTokenSchema , context.input.document ) ;
	}
	catch ( error ) {
		throw ErrorStatus.badRequest( error ) ;
	}

	if ( this.beforeCreateTokenHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			incomingDocument: context.input.document ,
			collectionNode: this ,
			parentObjectNode: context.parentObjectNode
		} ;

		await this.beforeCreateTokenHook( beforeContext ) ;
	}

	try {
		user = await this.collection.getUnique( { login: context.input.document.login , "parent.id": context.parentObjectNode.id } ) ;
	}
	catch ( error ) {
		throw ErrorStatus.unauthorized( "Unexistant login ID" ) ;
	}

	if ( user.password && typeof user.password === 'object' && typeof user.password.hash === 'string' ) {
		// Account protected by a password
		if ( user.password.hash !== hash.password( context.input.document.password , user.password.salt , user.password.algo ) ) {
			throw ErrorStatus.unauthorized( "Bad password" ) ;
		}
	}

	token = await this.createToken( user , context.input.document ) ;

	context.output.data = token ;

	afterContext = {
		input: context.input ,
		output: context.output ,
		alter: context.alter ,
		document: user ,
		collectionNode: this ,
		parentObjectNode: context.parentObjectNode ,
		token: token
	} ;

	if ( this.afterCreateTokenHook ) {
		try {
			await this.afterCreateTokenHook( afterContext ) ;
		}
		catch ( error ) {
			// /!\ Don't care?
			log.error( "Ignoring afterCreateToken hook error: %E" , error ) ;
		}
	}

	if ( context.output.extraData ) {
		context.output.data = Object.assign( {} , context.output.extraData , context.output.data ) ;
	}
} ;



// Generate a new token from the current one, i.e. generate a token without the need to authenticate again
UsersCollectionNode.prototype.regenerateTokenMethod = async function( context ) {
	var user , authToken , oldTokenData , tokenData , newToken , beforeContext , afterContext ;

	if ( ! context.input.performer.auth || ! context.input.performer.auth.token ) {
		throw ErrorStatus.badRequest( "No token in use to regenerate" ) ;
	}

	user = await context.input.performer.getUser() ;

	if ( ! user ) {
		throw ErrorStatus.badRequest( "Should be connected to regenerate a token" ) ;
	}

	if ( this.beforeRegenerateTokenHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			collectionNode: this ,
			parentObjectNode: context.parentObjectNode
		} ;

		await this.beforeRegenerateTokenHook( beforeContext ) ;
	}

	authToken = context.input.performer.auth.token ;
	oldTokenData = user.token[ authToken ] ;

	tokenData = {
		type: oldTokenData.type ,
		agentId: oldTokenData.agentId ,
		duration: oldTokenData.duration
	} ;

	// Current token TTL is capped to 10 seconds
	user.token[ authToken ].expirationTime = Math.min( user.token[ authToken ].expirationTime , Date.now() + 10000 ) ;

	newToken = await this.createToken( user , tokenData ) ;
	context.output.data = newToken ;

	afterContext = {
		input: context.input ,
		output: context.output ,
		alter: context.alter ,
		document: user ,
		collectionNode: this ,
		parentObjectNode: context.parentObjectNode ,
		token: newToken
	} ;

	if ( this.afterRegenerateTokenHook ) {
		try {
			await this.afterRegenerateTokenHook( afterContext ) ;
		}
		catch ( error ) {
			log.error( "Ignoring afterRegenerateToken hook error: %E" , error ) ;
		}
	}

	if ( context.output.extraData ) {
		context.output.data = Object.assign( {} , context.output.extraData , context.output.data ) ;
	}
} ;



UsersCollectionNode.prototype.revokeTokenMethod = async function( context ) {
	if ( ! context.input.performer.auth || ! context.input.performer.auth.token ) {
		throw ErrorStatus.badRequest( "No token in use to revoke" ) ;
	}

	var user = await context.input.performer.getUser() ;

	if ( ! user ) {
		throw ErrorStatus.badRequest( "Should be connected to revoke a token" ) ;
	}

	delete user.token[ context.input.performer.auth.token ] ;

	await user.commit() ;
	context.output.data = {} ;
} ;



UsersCollectionNode.prototype.revokeAllTokensMethod = async function( context ) {
	var user = await context.input.performer.getUser() ;

	if ( ! user ) {
		throw ErrorStatus.badRequest( "Should be connected to revoke all tokens" ) ;
	}

	user.token = {} ;
	await user.commit() ;

	context.output.data = {} ;
} ;



/*
	Mainly useful for debugging: it checks if the current token is still valid.
*/
UsersCollectionNode.prototype.checkTokenMethod = async function( context ) {
	var user , authToken , tokenData ;

	if ( ! context.input.performer.auth || ! context.input.performer.auth.token ) {
		throw ErrorStatus.badRequest( "No token provided" ) ;
	}

	user = await context.input.performer.getUser() ;

	if ( ! user ) {
		throw ErrorStatus.badRequest( "Should be connected to check a token" ) ;
	}

	authToken = context.input.performer.auth.token ;
	tokenData = user.token[ authToken ] ;

	context.output.data = {
		token: authToken ,
		type: tokenData.type ,
		agentId: tokenData.agentId ,
		creationTime: tokenData.creationTime ,
		expirationTime: tokenData.expirationTime ,
		duration: tokenData.duration ,
		userId: user._id ,
		userLogin: user.login ,
		userSlugId: user.slugId ,
		userParent: user.parent ,
		isApiKey: user.isApiKey
	} ;
} ;



// Generate a new API KEY
UsersCollectionNode.prototype.createApiKeyMethod = async function( context ) {
	var user , authApiKey , apiKeyData , newApiKey , beforeContext , afterContext ;

	//user = await context.input.performer.getUser() ;
	user = context.document ;

	if ( ! context.input.performer.system ) {
		throw ErrorStatus.badRequest( "Only system can create API keys ATM" ) ;
	}

	if ( this.beforecreateApiKeyHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			collectionNode: this ,
			objectNode: context.objectNode
		} ;

		await this.beforeCreateApiKeyHook( beforeContext ) ;
	}

	apiKey = await this.createApiKey( user , context.input.document ) ;

	context.output.data = apiKey ;

	afterContext = {
		input: context.input ,
		output: context.output ,
		alter: context.alter ,
		document: user ,
		collectionNode: this ,
		objectNode: context.objectNode ,
		apiKey: apiKey
	} ;

	if ( this.afterCreateApiKeyHook ) {
		try {
			await this.afterCreateApiKeyHook( afterContext ) ;
		}
		catch ( error ) {
			log.error( "Ignoring afterCreateApiKey hook error: %E" , error ) ;
		}
	}

	if ( context.output.extraData ) {
		context.output.data = Object.assign( {} , context.output.extraData , context.output.data ) ;
	}
} ;



UsersCollectionNode.prototype.revokeApiKeyMethod = async function( context ) {
	throw ErrorStatus.badRequest( "Not coded ATM" ) ;
} ;



UsersCollectionNode.prototype.revokeAllApiKeysMethod = async function( context ) {
	throw ErrorStatus.badRequest( "Not coded ATM" ) ;
} ;



/*
	* user: a user document
	* tokenData:
		* type: (header, cookie, ...)
		* agentId: 10 hex string (5 bytes)
		* duration: (optional) token validity time in ms
*/
UsersCollectionNode.prototype.createToken = async function( user , tokenData ) {
	var token , duration , tokenCount , tokenEngravedData , creationTime , expirationTime ;

	// Remove expired tokens
	tokenCount = this.cleanTokens( user.token ) ;

	// /!\ The limit is hard-coded, should make it configurable? /!\
	if ( tokenCount > 10 ) {
		throw ErrorStatus.forbidden( "Too many tokens" ) ;
	}

	// Forbid token with a duration greater than the config one
	if ( 'duration' in tokenData ) { duration = Math.min( this.app.tokenDuration , tokenData.duration ) ; }
	else { duration = this.app.tokenDuration ; }

	creationTime = Date.now() ;
	expirationTime = creationTime + duration ;

	tokenEngravedData = {
		typeCode: tokenType2Code[ tokenData.type ] ,
		userId: user.getId() ,
		agentId: tokenData.agentId ,
		expirationTime: expirationTime ,
		securityCode: crypto.pseudoRandomBytes( 8 ).toString( 'hex' )
	} ;

	token = this.tokenGenerator.create( tokenEngravedData ) ;

	// /!\ Get back engraved data? it may have some differences if the validation process is wrong...
	//tokenEngravedData = this.tokenGenerator.extract( token ) ;

	user.token[ token ] = {
		type: tokenData.type ,
		agentId: tokenEngravedData.agentId ,
		creationTime: creationTime ,
		expirationTime: tokenEngravedData.expirationTime ,
		duration: duration
	} ;


	// Stage and commit only the 'token' property
	user.stage( 'token' ) ;	// stage the whole token map?
	await user.commit() ;

	return {
		userId: user.getId() ,
		token: token ,
		type: tokenData.type ,
		agentId: tokenData.agentId ,
		creationTime: creationTime ,
		expirationTime: tokenEngravedData.expirationTime ,
		duration: duration
	} ;
} ;



/*
	* user: a user document
	* apiKeyData:
		* type: (header, cookie, ...)
		* agentId: 10 hex string (5 bytes)
*/
UsersCollectionNode.prototype.createApiKey = async function( user , apiKeyData ) {
	var apiKey , duration , apiKeyCount , apiKeyEngravedData , creationTime , expirationTime ;

	// /!\ The limit is hard-coded, should make it configurable? /!\
	if ( users.apiKeys.length > 10 ) {
		throw ErrorStatus.forbidden( "Too many API keys" ) ;
	}

	apiKeyEngravedData = {
		typeCode: tokenType2Code[ tokenData.type ] ,
		userId: user.getId() ,
		agentId: apiKeyData.agentId ,
		securityCode: crypto.pseudoRandomBytes( 45 ).toString( 'hex' )
	} ;

	apiKey = this.apiKeyGenerator.create( apiKeyEngravedData ) ;

	// /!\ Get back engraved data? it may have some differences if the validation process is wrong...
	//apiKeyEngravedData = this.apiKeyGenerator.extract( apiKey ) ;

	user.apiKeys.push( apiKey ) ;

	// Stage and commit only the 'apiKey' property
	user.stage( 'apiKeys' ) ;	// stage the whole apiKeys array?
	await user.commit() ;

	return {
		userId: user.getId() ,
		apiKey: apiKey ,
		type: apiKeyData.type ,
		agentId: apiKeyData.agentId
	} ;
} ;



UsersCollectionNode.prototype.extractFromToken = function( token ) {
	var data = this.tokenGenerator.extract( token ) ;
	data.type = tokenCode2Type[ data.typeCode ] ;
	delete data.typeCode ;
	return data ;
} ;



UsersCollectionNode.prototype.extractFromApiKey = function( apiKey ) {
	var data = this.apiKeyGenerator.extract( apiKey ) ;
	data.type = tokenCode2Type[ data.typeCode ] ;
	delete data.typeCode ;
	return data ;
} ;



UsersCollectionNode.prototype.cleanTokens = function( tokens ) {
	var key , now = Date.now() , count = 0 ;

	for ( key in tokens ) {
		if ( tokens[ key ].expirationTime < now ) { delete tokens[ key ] ; }
		else { count ++ ; }
	}

	return count ;
} ;

