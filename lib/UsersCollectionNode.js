/*
	Rest Query

	Copyright (c) 2014 - 2021 Cédric Ronvel

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
const CollectionNode = restQuery.CollectionNode ;

const Promise = require( 'seventh' ) ;

const crypto = require( 'crypto' ) ;

const ErrorStatus = require( 'error-status' ) ;
const doormen = require( 'doormen' ) ;
const hash = require( 'hash-kit' ) ;
const tree = require( 'tree-kit' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;



/* UsersCollectionNode */



function UsersCollectionNode( app , schema ) {
	schema = doormen( UsersCollectionNode.schemaSchema , schema ) ;

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
			optional: true ,
			tags: [ 'id' ]
		} ;
	}

	// This is a special property, it is always erased when set
	schema.properties.passwordInput = {
		type: 'string' ,
		system: true ,
		optional: true ,
		tags: [ 'passwordInput' ]
	} ;

	schema.properties.password = {
		type: 'strictObject' ,
		system: true ,
		optional: true ,
		tags: [ 'security' ] ,
		noSubmasking: true ,
		properties: {
			hash: { type: 'string' } ,
			algo: { type: 'string' , default: 'sha512' } ,
			salt: { type: 'string' , default: '' }
		}
	} ;

	schema.properties.apiKeys = {
		type: 'array' ,
		system: true ,
		tags: [ 'security' ] ,
		noSubmasking: true ,
		default: [] ,
		of: {
			type: 'strictObject' ,
			properties: {
				start: { type: 'string' } ,	// Used to identify an API key from the client-side, contains only the first 8 chars of a the 128 chars
				hash: { type: 'string' } ,
				algo: { type: 'string' , default: 'sha512' } ,
				salt: { type: 'string' , default: '' }
			}
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
		tags: [ 'security' ] ,
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

	// One unique login among siblings
	// It must support unexisting login
	//schema.indexes.push( { properties: { login: 1 , "parent.id": 1 } , unique: true } ) ;
	schema.indexes.push( { properties: { login: 1 , "parent.id": 1 } , unique: true , partial: true } ) ;

	// Call the parent constructor
	CollectionNode.call( this , app , 'users' , schema ) ;

	// Add methods
	this.addCollectionMethods( 'whoAmIMethod' , 'createTokenMethod' , 'regenerateTokenMethod' , 'revokeTokenMethod' , 'revokeAllTokensMethod' , 'checkTokenMethod' ) ;
	this.addObjectMethods( 'createApiKeyMethod' , 'revokeApiKeyMethod' , 'revokeAllApiKeysMethod' ) ;
}

module.exports = UsersCollectionNode ;

UsersCollectionNode.prototype = Object.create( CollectionNode.prototype ) ;
UsersCollectionNode.prototype.constructor = UsersCollectionNode ;



// WIP...

UsersCollectionNode.schemaSchema = tree.extend(
	{ deep: true } ,
	{} ,
	CollectionNode.schemaSchema ,
	{}
) ;



UsersCollectionNode.prototype.initDocument = function( object , initApplied = {} ) {
	if ( typeof object.passwordInput === 'string' ) {
		object.password = this.passwordObject( object.passwordInput ) ;
		object.passwordInput = '' ;
		initApplied.password = true ;
		initApplied.passwordInput = true ;
	}

	if ( typeof object.password === 'string' ) {
		object.password = this.passwordObject( object.password ) ;
		initApplied.password = true ;
	}

	CollectionNode.prototype.initDocument.call( this , object , initApplied ) ;
} ;



UsersCollectionNode.prototype.initPatch = function( incomingPatch ) {
	if ( typeof incomingPatch.passwordInput === 'string' ) {
		incomingPatch.password = this.passwordObject( incomingPatch.passwordInput ) ;
		incomingPatch.passwordInput = '' ;
	}

	if ( typeof incomingPatch.password === 'string' ) {
		incomingPatch.password = this.passwordObject( incomingPatch.password ) ;
	}

	CollectionNode.prototype.initPatch.call( this , incomingPatch ) ;
} ;



UsersCollectionNode.prototype.passwordObject = function( password ) {
	var algo = 'sha512' ,
		salt = hash.randomIdentifier( 10 ) ,
		hashStr = hash.password( password , salt , algo ) ;

	return { hash: hashStr , algo , salt } ;
} ;



UsersCollectionNode.prototype.apiKeyGenerator = new restQuery.TokenGenerator( [
	{ key: 'securityCode' , type: 'hex' , length: 46 } ,
	{ key: 'userId' , type: 'hex' , length: 12 } ,	// MongoId: 12 bytes, 24 hex chars
	{ key: 'agentId' , type: 'hex' , length: 20 } ,	// 40 hex chars
	{ key: 'typeCode' , type: 'BASE36' , length: 2 }
] ) ;



UsersCollectionNode.prototype.tokenGenerator = new restQuery.TokenGenerator( [
	{ key: 'expirationTime' , type: 'int' , length: 6 } ,	// in ms
	{ key: 'userId' , type: 'hex' , length: 12 } ,	// MongoId: 12 bytes, 24 hex chars
	{ key: 'agentId' , type: 'hex' , length: 5 } ,	// 10 hex chars
	// actually that can be dangerous, giving some informations to a hacker, it's best to give those 2 bytes to the security code
	//{ key: 'increment' , type: 'increment16' } ,
	{ key: 'securityCode' , type: 'hex' , length: 8 } ,
	{ key: 'typeCode' , type: 'BASE36' , length: 2 }
] ) ;



const tokenType2Code = {
	header: 'H' ,
	cookie: 'CK' ,
	queryString: 'QS' ,
	urlAuth: 'UA' ,
	basicAuth: 'BA' ,
	web: 'W3'
} ;

const tokenCode2Type = {
	H: 'header' ,
	CK: 'cookie' ,
	QS: 'queryString' ,
	UA: 'urlAuth' ,
	BA: 'basicAuth' ,
	W3: 'web'
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

	if ( ! Object.hasOwn( tokenType2Code , tokenData.type ) ) {
		throw ErrorStatus.badRequest( "Bad token type" ) ;
	}

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
		userLogin: user.login ,
		userSlugId: user.slugId ,	// Consistency with checkTokenMethod
		userParent: user.parent ,	// Consistency with checkTokenMethod
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
		* agentId: 40 hex string (20 bytes)
*/
UsersCollectionNode.prototype.createApiKey = async function( user , apiKeyData ) {
	var apiKey , apiKeyObject , apiKeyEngravedData ;

	// /!\ The limit is hard-coded, should make it configurable? /!\
	if ( user.apiKeys.length > 10 ) {
		throw ErrorStatus.forbidden( "Too many API keys" ) ;
	}

	if ( ! Object.hasOwn( tokenType2Code , apiKeyData.type ) ) {
		throw ErrorStatus.badRequest( "Bad token type" ) ;
	}

	apiKeyEngravedData = {
		typeCode: tokenType2Code[ apiKeyData.type ] ,
		userId: user.getId() ,
		agentId: apiKeyData.agentId ,
		securityCode: crypto.pseudoRandomBytes( 45 ).toString( 'hex' )
	} ;

	apiKey = this.apiKeyGenerator.create( apiKeyEngravedData ) ;

	apiKeyObject = {
		start: apiKey.slice( 0 , 6 ) ,
		hash: null ,
		algo: 'sha512' ,
		salt: hash.randomIdentifier( 10 )
	} ;

	apiKeyObject.hash = hash.password( apiKey , apiKeyObject.salt , apiKeyObject.algo ) ;

	// /!\ Get back engraved data? it may have some differences if the validation process is wrong...
	//apiKeyEngravedData = this.apiKeyGenerator.extract( apiKey ) ;

	user.apiKeys.push( apiKeyObject ) ;

	// Stage and commit only the 'apiKey' property
	user.stage( 'apiKeys' ) ;	// stage the whole apiKeys array?
	await user.commit() ;

	return {
		userId: user.getId() ,
		userLogin: user.login ,
		apiKey: apiKey ,
		apiKeyObject: apiKeyObject ,
		type: apiKeyData.type ,
		agentId: apiKeyData.agentId
	} ;
} ;



UsersCollectionNode.prototype.extractFromToken = function( token ) {
	var data ;

	try {
		data = this.tokenGenerator.extract( token ) ;
	}
	catch ( error ) {
		throw ErrorStatus.badRequest( "Bad token" ) ;
	}

	if ( ! Object.hasOwn( tokenCode2Type , data.typeCode ) ) {
		throw ErrorStatus.badRequest( "Bad token engraved type" ) ;
	}

	data.type = tokenCode2Type[ data.typeCode ] ;
	delete data.typeCode ;
	return data ;
} ;



UsersCollectionNode.prototype.extractFromApiKey = function( apiKey ) {
	var data ;

	try {
		data = this.apiKeyGenerator.extract( apiKey ) ;
	}
	catch ( error ) {
		throw ErrorStatus.badRequest( "Bad token" ) ;
	}

	if ( ! Object.hasOwn( tokenCode2Type , data.typeCode ) ) {
		throw ErrorStatus.badRequest( "Bad token engraved type" ) ;
	}

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



/* Users' Methods */



// Used mainly for debugging
UsersCollectionNode.prototype.whoAmIMethod = async function( context ) {
	var user ;

	if ( context.performer.system ) {
		context.output.data = { performer: 'system' } ;
	}
	else if ( ! context.performer.auth ) {
		context.output.data = { performer: 'unconnected' } ;
	}
	else {
		// Let it crash
		//try {
		user = await context.performer.getUser() ;
		context.output.data = {
			performer: {
				_id: user._id ,
				login: user.login ,
				slugId: user.slugId ,
				groups: user.groups
			} ,
			authBy: context.performer.authBy
		} ;
		/*
		} catch ( error ) {
			context.output.data = {
				performer: 'unconnected' ,
				reason: error.message
			} ;
		}
		*/
	}

	if ( context.performer.debugGrant ) {
		context.output.data.debugGrant = context.performer.debugGrant ;
	}
} ;



const createTokenSchema = {
	type: 'strictObject' ,
	properties: {
		type: { in: [ 'header' , 'cookie' , 'queryString' , 'urlAuth' , 'basicAuth' , 'web' ] } ,
		agentId: { type: 'hex' , length: 10 , default: "0000000000" } ,
		login: { type: 'string' } ,
		password: { type: 'string' } ,
		duration: { type: 'integer' , optional: true }
	}
} ;



UsersCollectionNode.prototype.createTokenMethod = async function( context ) {
	var user , token ;

	try {
		doormen( createTokenSchema , context.input.document ) ;
	}
	catch ( error ) {
		throw ErrorStatus.badRequest( error ) ;
	}

	try {
		user = await this.collection.getUnique( { login: context.input.document.login , "parent.id": context.parentObjectNode.id } ) ;
	}
	catch ( error ) {
		throw ErrorStatus.unauthorized( "Unexistant login ID" ) ;
	}

	context.document = user ;

	if ( this.hooks.beforeCreateToken ) {
		await restQuery.hooks.run( this.hooks.beforeCreateToken , context , { incomingDocument: context.input.document } ) ;
		if ( context.isDone ) { return context ; }
	}

	// First, check if that user has a password, if not, it's not possible to log in
	if ( ! user.password || typeof user.password !== 'object' || typeof user.password.hash !== 'string' ) {
		throw ErrorStatus.unauthorized( "Login is disabled for this user" ) ;
	}

	// Check the password
	if ( user.password.hash !== hash.password( context.input.document.password , user.password.salt , user.password.algo ) ) {
		throw ErrorStatus.unauthorized( "Bad password" ) ;
	}

	token = await this.createToken( user , context.input.document ) ;
	context.output.data = token ;

	if ( this.hooks.afterCreateToken ) {
		await restQuery.hooks.runAfter( this.hooks.afterCreateToken , context , { token } ) ;
	}

	if ( context.output.extraData ) {
		context.output.data = Object.assign( {} , context.output.extraData , context.output.data ) ;
	}
} ;



// Generate a new token from the current one, i.e. generate a token without the need to authenticate again
UsersCollectionNode.prototype.regenerateTokenMethod = async function( context ) {
	var user , authToken , oldTokenData , tokenData , newToken ;

	if ( ! context.performer.auth || ! context.performer.auth.token ) {
		throw ErrorStatus.badRequest( "No token in use to regenerate" ) ;
	}

	user = await context.performer.getUser() ;

	if ( ! user ) {
		throw ErrorStatus.badRequest( "Should be connected to regenerate a token" ) ;
	}

	context.document = user ;

	if ( this.hooks.beforeRegenerateToken ) {
		await restQuery.hooks.run( this.hooks.beforeRegenerateToken , context ) ;
		if ( context.isDone ) { return context ; }
	}

	authToken = context.performer.auth.token ;
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

	if ( this.hooks.afterRegenerateToken ) {
		await restQuery.hooks.runAfter( this.hooks.afterRegenerateToken , context , { token: newToken } ) ;
	}

	if ( context.output.extraData ) {
		context.output.data = Object.assign( {} , context.output.extraData , context.output.data ) ;
	}
} ;



UsersCollectionNode.prototype.revokeTokenMethod = async function( context ) {
	if ( ! context.performer.auth || ! context.performer.auth.token ) {
		throw ErrorStatus.badRequest( "No token in use to revoke" ) ;
	}

	var user = await context.performer.getUser() ;

	if ( ! user ) {
		throw ErrorStatus.badRequest( "Should be connected to revoke a token" ) ;
	}

	delete user.token[ context.performer.auth.token ] ;

	await user.commit() ;
	context.output.data = {} ;
} ;



UsersCollectionNode.prototype.revokeAllTokensMethod = async function( context ) {
	var user = await context.performer.getUser() ;

	if ( ! user ) {
		throw ErrorStatus.badRequest( "Should be connected to revoke all tokens" ) ;
	}

	user.token = {} ;
	await user.commit() ;

	context.output.data = {} ;
} ;



/*
	Initially mainly useful for debugging: it checks if the current token is still valid.

	Now it is also used by the web client to check if the token is still valid when the computer wake up from the sleep-mode,
	or when the user press F5.
*/
UsersCollectionNode.prototype.checkTokenMethod = async function( context ) {
	var user , authToken , tokenData ;

	if ( ! context.performer.auth || ! context.performer.auth.token ) {
		throw ErrorStatus.badRequest( "No token provided" ) ;
	}

	user = await context.performer.getUser() ;

	if ( ! user ) {
		throw ErrorStatus.badRequest( "Should be connected to check a token" ) ;
	}

	authToken = context.performer.auth.token ;
	tokenData = user.token[ authToken ] ;

	context.output.data = {
		userId: user._id ,
		userLogin: user.login ,
		userSlugId: user.slugId ,
		userParent: user.parent ,
		token: authToken ,
		type: tokenData.type ,
		agentId: tokenData.agentId ,
		creationTime: tokenData.creationTime ,
		expirationTime: tokenData.expirationTime ,
		duration: tokenData.duration
	} ;
} ;



const createApiKeySchema = {
	type: 'strictObject' ,
	properties: {
		type: { in: [ 'header' , 'cookie' , 'queryString' , 'urlAuth' , 'basicAuth' , 'web' ] } ,
		agentId: { type: 'hex' , length: 40 , default: "0000000000000000000000000000000000000000" }
	}
} ;



// Generate a new API KEY
UsersCollectionNode.prototype.createApiKeyMethod = async function( context ) {
	var user , apiKeyData ;

	//if ( ! context.performer.system ) { throw ErrorStatus.badRequest( "Only system can create API keys ATM" ) ; }

	try {
		doormen( createApiKeySchema , context.input.document ) ;
	}
	catch ( error ) {
		throw ErrorStatus.badRequest( error ) ;
	}

	user = context.document ;

	if ( this.hooks.beforeCreateApiKey ) {
		await restQuery.hooks.run( this.hooks.beforeCreateApiKey , context ) ;
		if ( context.isDone ) { return context ; }
	}

	apiKeyData = await this.createApiKey( user , context.input.document ) ;

	context.output.data = {
		userId: apiKeyData.userId ,
		userLogin: user.login ,
		type: apiKeyData.type ,
		agentId: apiKeyData.agentId ,
		apiKey: apiKeyData.apiKey
	} ;

	context.document = user ;

	if ( this.hooks.afterCreateApiKey ) {
		await restQuery.hooks.runAfter( this.hooks.afterCreateApiKey , context , { apiKeyData } ) ;
	}

	if ( context.output.extraData ) {
		context.output.data = Object.assign( {} , context.output.extraData , context.output.data ) ;
	}
} ;

UsersCollectionNode.prototype.createApiKeyMethod.tags = [ 'security' , 'apiKeyManagement' ] ;



UsersCollectionNode.prototype.revokeApiKeyMethod = async function( context ) {
	//if ( ! context.performer.system ) { throw ErrorStatus.badRequest( "Only system can revoke API keys ATM" ) ; }

	if ( ! context.input.document || ! context.input.document.apiKey ) {
		throw ErrorStatus.badRequest( "Missing document with an apiKey property" ) ;
	}

	var found = 0 ,
		user = context.document ,
		apiKey = context.input.document.apiKey ;

	var filteredApiKeys = user.apiKeys.filter( apiKeyObject => {
		if ( apiKey.startsWith( apiKeyObject.start ) && apiKeyObject.hash === hash.password( apiKey , apiKeyObject.salt , apiKeyObject.algo ) ) {
			found ++ ;
			return false ;
		}

		return true ;
	} ) ;

	if ( found ) {
		user.apiKeys = filteredApiKeys ;
		user.stage( 'apiKeys' ) ;	// stage the whole apiKey array?
		await user.commit() ;

		context.output.data = { removed: found } ;
		return ;
	}

	throw ErrorStatus.notFound( "API Key not found" ) ;
} ;

UsersCollectionNode.prototype.revokeApiKeyMethod.tags = [ 'security' , 'apiKeyManagement' ] ;



UsersCollectionNode.prototype.revokeAllApiKeysMethod = async function( context ) {
	//if ( ! context.performer.system ) { throw ErrorStatus.badRequest( "Only system can revoke API keys ATM" ) ; }

	var user = context.document ;
	var found = user.apiKeys.length ;

	user.apiKeys = [] ;
	user.stage( 'apiKeys' ) ;	// stage the whole apiKey array?
	await user.commit() ;

	context.output.data = { removed: found } ;
} ;

UsersCollectionNode.prototype.revokeAllApiKeysMethod.tags = [ 'security' , 'apiKeyManagement' ] ;

