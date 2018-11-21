/*
	Rest Query

	Copyright (c) 2014 - 2018 Cédric Ronvel

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
const tokenKit = require( 'token-kit' ) ;
const tree = require( 'tree-kit' ) ;





/* UsersCollectionNode */



function UsersCollectionNode( app , schema ) {
	doormen( UsersCollectionNode.schemaSchema , schema ) ;

	schema.properties.isApiKey = {
		type: 'boolean' ,
		system: true ,
		tier: 5 ,
		default: false		// if true, login is an API key and does not need a password
	} ;

	if ( schema.properties.login && typeof schema.properties.login === 'object' ) {
		tree.extend( { deep: true } , schema.properties.login , {
			type: 'string' ,
			system: true ,
			tier: 1
		} ) ;
	}
	else {
		schema.properties.login = {
			type: 'string' ,
			system: true ,
			tier: 1
		} ;
	}

	schema.properties.password = {
		optional: true ,
		system: true ,
		type: 'strictObject' ,
		tier: 5 ,
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
		tier: 3
	} ;

	schema.properties.token = {
		type: 'strictObject' ,
		system: true ,
		tier: 5 ,
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

	if ( schema.properties.hooks ) {
		schema.properties.hooks.properties.beforeCreateToken = restQuery.CollectionNode.restQueryHookSchema ;
		schema.properties.hooks.properties.afterCreateToken = restQuery.CollectionNode.restQueryHookSchema ;
	}

	// One unique login among siblings
	restQuery.CollectionNode.ensureIndex( schema.indexes , { properties: { login: 1 , "parent.id": 1 } , unique: true } ) ;

	// Call the parent constructor
	restQuery.CollectionNode.call( this , app , 'users' , schema ) ;

	this.beforeCreateTokenHook = schema.hooks.beforeCreateToken && schema.hooks.beforeCreateToken.bind( app ) ;
	this.afterCreateTokenHook = schema.hooks.afterCreateToken && schema.hooks.afterCreateToken.bind( app ) ;

	// Add methods
	this.collectionMethods.createToken = UsersCollectionNode.prototype.createTokenMethod.bind( this ) ;
	this.collectionMethods.regenerateToken = UsersCollectionNode.prototype.regenerateTokenMethod.bind( this ) ;
	this.collectionMethods.revokeToken = UsersCollectionNode.prototype.revokeTokenMethod.bind( this ) ;
	this.collectionMethods.revokeAllTokens = UsersCollectionNode.prototype.revokeAllTokensMethod.bind( this ) ;
	this.collectionMethods.checkToken = UsersCollectionNode.prototype.checkTokenMethod.bind( this ) ;

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



UsersCollectionNode.prototype.tokenGenerator = tokenKit( [
	{ key: 'expirationTime' , type: 'int' , length: 6 } ,	// in ms
	{ key: 'userId' , type: 'hex' , length: 12 } ,	// MongoId: 12 bytes, 24 hex chars
	{ key: 'agentId' , type: 'hex' , length: 5 } ,	// 10 hex chars
	// actually that can be dangerous, giving some informations to a hacker, it's best to give those 2 bytes to the security code
	//{ key: 'increment' , type: 'increment16' } ,
	{ key: 'securityCode' , type: 'hex' , length: 8 } ,
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



UsersCollectionNode.prototype.createTokenMethod = async function( path , incomingDocument , attachmentStreams , context ) {
	var user , token , beforeContext , afterContext ;

	try {
		doormen( createTokenSchema , incomingDocument ) ;
	}
	catch ( error ) {
		throw ErrorStatus.badRequest( error ) ;
	}

	if ( this.beforeCreateTokenHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			//alter: context.alter ,
			incomingDocument: incomingDocument ,
			collectionNode: this ,
			parentObjectNode: context.parentObjectNode
		} ;

		await this.beforeCreateTokenHook() ;
	}

	token = await new Promise( ( resolve , reject ) => {

		this.collection.getUnique( { login: incomingDocument.login , "parent.id": context.parentObjectNode.id } , ( error , user_ ) => {

			user = user_ ;

			if ( error ) {
				reject( ErrorStatus.unauthorized( "Unexistant login ID" ) ) ;
				return ;
			}

			if ( user.password && typeof user.password === 'object' && typeof user.password.hash === 'string' ) {
				// Account protected by a password
				if ( user.password.hash !== hash.password( incomingDocument.password , user.password.salt , user.password.algo ) ) {
					reject( ErrorStatus.unauthorized( "Bad password" ) ) ;
					return ;
				}
			}

			this.createToken( user , incomingDocument , ( error_ , token_ ) => {
				if ( error_ ) { reject( error_ ) ; }
				else { resolve( token_ ) ; }
			} ) ;
		} ) ;
	} ) ;

	if ( this.afterCreateTokenHook ) {
		afterContext = {
			input: context.input ,
			output: context.output ,
			//alter: context.alter ,
			document: user ,
			collectionNode: this ,
			//objectNode: this.createObjectNode( incomingDocument , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) , context.alter )
			token: token
		} ;

		try {
			await this.afterCreateTokenHook( afterContext ) ;
		}
		catch ( error ) {
			// /!\ Don't care?
		}
	}

	return token ;
} ;

/*
UsersCollectionNode.prototype.createTokenMethod = function( path , incomingDocument , attachmentStreams , context , callback )
{
	try {
		doormen( createTokenSchema , incomingDocument ) ;
	}
	catch ( error ) {
		callback( ErrorStatus.badRequest( error ) ) ;
		return ;
	}

	this.collection.getUnique( { login: incomingDocument.login, "parent.id": context.parentObjectNode.id } , ( error , user ) => {

		if ( error )
		{
			callback( ErrorStatus.unauthorized( "Unexistant login ID" ) ) ;
			return ;
		}

		if ( user.password && typeof user.password === 'object' && typeof user.password.hash === 'string' )
		{
			// Account protected by a password
			if ( user.password.hash !== hash.password( incomingDocument.password , user.password.salt , user.password.algo ) )
			{
				callback( ErrorStatus.unauthorized( "Bad password" ) ) ;
				return ;
			}
		}

		this.createToken( user , incomingDocument , callback ) ;
	} ) ;
} ;
*/


UsersCollectionNode.prototype.regenerateTokenMethod = function( path , incomingDocument , attachmentStreams , context ) {
	if ( ! context.input.performer.auth || ! context.input.performer.auth.token ) {
		return Promise.reject( ErrorStatus.badRequest( "No token in use to regenerate" ) ) ;
	}

	return new Promise( ( resolve , reject ) => {
		context.input.performer.getUser( ( error , user ) => {

			var token , oldTokenData , tokenData ;

			if ( error ) { reject( error ) ; return ; }

			if ( ! user ) {
				reject( ErrorStatus.badRequest( "Should be connected to regenerate a token" ) ) ;
				return ;
			}

			token = context.input.performer.auth.token ;
			oldTokenData = user.token[ token ] ;

			tokenData = {
				type: oldTokenData.type ,
				agentId: oldTokenData.agentId ,
				duration: oldTokenData.duration
			} ;

			// Current token TTL is capped to 10 seconds
			user.token[ token ].expirationTime = Math.min( user.token[ token ].expirationTime , Date.now() + 10000 ) ;

			this.createToken( user , tokenData , ( error_ , token_ ) => {
				if ( error_ ) { reject( error_ ) ; }
				else { resolve( token_ ) ; }
			} ) ;
		} ) ;
	} ) ;
} ;



/*
UsersCollectionNode.prototype.regenerateTokenMethod = function( path , incomingDocument , attachmentStreams , context , callback )
{
	if ( ! context.input.performer.auth || ! context.input.performer.auth.token )
	{
		callback( ErrorStatus.badRequest( "No token in use to regenerate" ) ) ;
		return ;
	}

	context.input.performer.getUser( ( error , user ) => {

		var token , oldTokenData , tokenData ;

		if ( error ) { callback( error ) ; return ; }

		if ( ! user )
		{
			callback( ErrorStatus.badRequest( "Should be connected to regenerate a token" ) ) ;
			return ;
		}

		token = context.input.performer.auth.token ;
		oldTokenData = user.token[ token ] ;

		tokenData = {
			type: oldTokenData.type ,
			agentId: oldTokenData.agentId ,
			duration: oldTokenData.duration
		} ;

		// Current token TTL is capped to 10 seconds
		user.token[ token ].expirationTime = Math.min( user.token[ token ].expirationTime , Date.now() + 10000 ) ;

		this.createToken( user , tokenData , callback ) ;
	} ) ;
} ;
*/


UsersCollectionNode.prototype.revokeTokenMethod = function( path , incomingDocument , attachmentStreams , context ) {
	if ( ! context.input.performer.auth || ! context.input.performer.auth.token ) {
		return Promise.reject( ErrorStatus.badRequest( "No token in use to revoke" ) ) ;
	}

	return new Promise( ( resolve , reject ) => {

		context.input.performer.getUser( ( error , user ) => {

			if ( error ) { reject( error ) ; return ; }

			if ( ! user ) {
				reject( ErrorStatus.badRequest( "Should be connected to revoke a token" ) ) ;
				return ;
			}

			delete user.token[ context.input.performer.auth.token ] ;

			user.$.stage( 'token' ) ;

			user.$.commit( error_ => {
				resolve( {} ) ;
			} ) ;
		} ) ;
	} ) ;
} ;


/*
UsersCollectionNode.prototype.revokeTokenMethod = function( path , incomingDocument , attachmentStreams , context , callback )
{
	if ( ! context.input.performer.auth || ! context.input.performer.auth.token )
	{
		callback( ErrorStatus.badRequest( "No token in use to revoke" ) ) ;
		return ;
	}

	context.input.performer.getUser( ( error , user ) => {

		if ( error ) { callback( error ) ; return ; }

		if ( ! user )
		{
			callback( ErrorStatus.badRequest( "Should be connected to revoke a token" ) ) ;
			return ;
		}

		delete user.token[ context.input.performer.auth.token ] ;

		user.$.stage( 'token' ) ;

		user.$.commit( error => {
			callback( undefined , {} , {} ) ;
		} ) ;
	} ) ;
} ;
*/


UsersCollectionNode.prototype.revokeAllTokensMethod = function( path , incomingDocument , attachmentStreams , context ) {
	return new Promise( ( resolve , reject ) => {

		context.input.performer.getUser( ( error , user ) => {

			if ( error ) { reject( error ) ; return ; }

			if ( ! user ) {
				reject( ErrorStatus.badRequest( "Should be connected to revoke all tokens" ) ) ;
				return ;
			}

			user.token = {} ;

			user.$.stage( 'token' ) ;

			user.$.commit( error_ => {
				resolve( {} ) ;
			} ) ;
		} ) ;
	} ) ;
} ;


/*
UsersCollectionNode.prototype.revokeAllTokensMethod = function( path , incomingDocument , attachmentStreams , context , callback )
{
	context.input.performer.getUser( ( error , user ) => {

		if ( error ) { callback( error ) ; return ; }

		if ( ! user )
		{
			callback( ErrorStatus.badRequest( "Should be connected to revoke all tokens" ) ) ;
			return ;
		}

		user.token = {} ;

		user.$.stage( 'token' ) ;

		user.$.commit( error => {
			callback( undefined , {} , {} ) ;
		} ) ;
	} ) ;
} ;
*/


/*
	Mainly useful for debugging: it checks if the current token is still valid.
*/
UsersCollectionNode.prototype.checkTokenMethod = function( path , incomingDocument , attachmentStreams , context ) {
	if ( ! context.input.performer.auth || ! context.input.performer.auth.token ) {
		return Promise.reject( ErrorStatus.badRequest( "No token provided" ) ) ;
	}

	return new Promise( ( resolve , reject ) => {
		context.input.performer.getUser( ( error , user ) => {

			var token , tokenData ;

			if ( error ) { reject( error ) ; return ; }

			if ( ! user ) {
				reject( ErrorStatus.badRequest( "Should be connected to check a token" ) ) ;
				return ;
			}

			token = context.input.performer.auth.token ;
			tokenData = user.token[ token ] ;

			resolve( {
				token: token ,
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
			} ) ;
		} ) ;
	} ) ;
} ;


/*
UsersCollectionNode.prototype.checkTokenMethod = function( path , incomingDocument , attachmentStreams , context , callback )
{
	if ( ! context.input.performer.auth || ! context.input.performer.auth.token )
	{
		callback( ErrorStatus.badRequest( "No token provided" ) ) ;
		return ;
	}

	context.input.performer.getUser( ( error , user ) => {

		var token , oldTokenData , tokenData ;

		if ( error ) { callback( error ) ; return ; }

		if ( ! user )
		{
			callback( ErrorStatus.badRequest( "Should be connected to check a token" ) ) ;
			return ;
		}

		token = context.input.performer.auth.token ;
		tokenData = user.token[ token ] ;

		callback( undefined , {
			token: token ,
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
		} , {} ) ;
	} ) ;
} ;
*/


/*
	* user: a user document
	* tokenData:
		* type: (header, cookie, ...)
		* agentId: 10 hex string (5 bytes)
		* duration: (optional) token validity time in ms
*/
UsersCollectionNode.prototype.createToken = function( user , tokenData , callback ) {
	var token , duration , tokenCount , tokenEngravedData , creationTime , expirationTime ;

	// Remove expired tokens
	tokenCount = this.cleanTokens( user.token ) ;

	// /!\ The limit is hard-coded, should make it configurable? /!\
	if ( tokenCount > 10 ) {
		callback( ErrorStatus.forbidden( "Too many tokens" ) ) ;
		return ;
	}

	// Forbid token with a duration greater than the config one
	if ( 'duration' in tokenData ) { duration = Math.min( this.app.tokenDuration , tokenData.duration ) ; }
	else { duration = this.app.tokenDuration ; }

	creationTime = Date.now() ;
	expirationTime = creationTime + duration ;

	tokenEngravedData = {
		typeCode: tokenType2Code[ tokenData.type ] ,
		userId: user.$.id ,
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

	user.$.stage( 'token' ) ;

	user.$.commit( error => {
		if ( error ) { callback( error ) ; return ; }

		callback( undefined , {
			userId: user.$.id ,
			token: token ,
			type: tokenData.type ,
			agentId: tokenData.agentId ,
			creationTime: creationTime ,
			expirationTime: tokenEngravedData.expirationTime ,
			duration: duration
		} , {} ) ;
	} ) ;
} ;



UsersCollectionNode.prototype.extractFromToken = function( token ) {
	var data = this.tokenGenerator.extract( token ) ;
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

