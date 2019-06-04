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



const events = require( 'events' ) ;

const hash = require( 'hash-kit' ) ;
const Promise = require( 'seventh' ) ;
const ErrorStatus = require( 'error-status' ) ;



/* Performer -- user performing the action */



// /!\ API KEYS are only supported for the SYSTEM pseudo-user ATM /!\

function Performer( app , auth , system ) {
	this.app = app ;
	this.auth = auth || null ;
	this.system = !! system ;

	this.authBy = null ;

	this.userPromise = null ;
	this.groupsPromise = null ;

	this._user = null ;	// Should not be used outside internal optimization case

	if ( this.auth && this.auth.apiKey && app.systemApiKey && this.auth.apiKey === app.systemApiKey ) {
		this.system = true ;
		this.authBy = 'apiKey' ;
	}
}

module.exports = Performer ;

Performer.prototype = Object.create( events.prototype ) ;
Performer.prototype.constructor = Performer ;



// Reset the performance: destroy cached data, force a new DB round trip for the next .getUser()/.getGroups() call
Performer.prototype.reset = function() {
	this.authBy = null ;
	this.userPromise = null ;
	this.groupsPromise = null ;
	this._user = null ;
} ;



/*
	app: the app object
	auth: auth object identifying the user (most of time created by the HttpModule)
	system: boolean, true if the operation is performed by the system, not an user
*/
Performer.prototype.getUser = function() {
	if ( this.userPromise ) { return this.userPromise ; }

	// If this is a "system" performer or if no auth, do nothing
	if ( this.system || ! this.auth ) {
		this._user = false ;
		return ( this.userPromise = Promise.resolve( null ) ) ;
	}

	if ( this.auth.apiKey ) {
		this.authBy = 'apiKey' ;
		return ( this.userPromise = this.getUserByApiKey( this.auth ) ) ;
	}
	
	if ( this.auth.token ) {
		this.authBy = 'token' ;
		return ( this.userPromise = this.getUserByToken( this.auth ) ) ;
	}

	return ( this.userPromise = Promise.reject( ErrorStatus.badRequest( 'Not a valid authentication' ) ) ) ;
} ;



Performer.prototype.getGroups = function() {
	if ( this.groupsPromise ) { return this.groupsPromise ; }

	// If this is a "system" performer, do nothing
	if ( this.system ) { return ( this.groupsPromise = Promise.resolve( null ) ) ; }

	this.groupsPromise = new Promise() ;

	return this.getUser()
		.then( user => {
			if ( ! user ) { return this.groupsPromise.resolve( [] ) ; }	// /!\ return an empty batch instead?
			return user.getLink( 'groups' ) ;
		} )
		.then( groups => {
			return this.groupsPromise.resolve( groups ) ;
		} ) ;
} ;



Performer.tokenAcceptAuthType = {
	header: [ 'header' ] ,
	cookie: [ 'cookie' ] ,
	queryString: [ 'queryString' ] ,
	urlAuth: [ 'urlAuth' ] ,
	basicAuth: [ 'basicAuth' ] ,
	web: [ 'header' , 'queryString' ]
} ;



Performer.prototype.getUserByToken = function( auth ) {
	var tokenEngravedData , now = Date.now() ;

	// Extract token data
	try {
		tokenEngravedData = this.app.collectionNodes.users.extractFromToken( auth.token ) ;
	}
	catch ( error ) {
		return Promise.reject( ErrorStatus.badRequest( 'This is not a valid token' ) ) ;
	}

	//if ( tokenEngravedData.type !== auth.type )
	if ( Performer.tokenAcceptAuthType[ tokenEngravedData.type ].indexOf( auth.type ) === -1 ) {
		return Promise.reject( ErrorStatus.unauthorized( 'Auth method mismatch for this token' ) ) ;
	}

	if ( tokenEngravedData.expirationTime < now ) {
		// Do not bother the database if the token has already expired!
		return Promise.reject( ErrorStatus.unauthorized( 'This token has already expired.' ) ) ;
	}


	// /!\ should get by id *AND* parent.id ??? /!\

	return this.app.collectionNodes.users.collection.get( tokenEngravedData.userId ).then(
		user => {
			var tokenData ;

			if ( ! user.token[ auth.token ] ) {
				throw ErrorStatus.unauthorized( 'Token not found.' ) ;
			}

			tokenData = user.token[ auth.token ] ;

			/*	Not possible, a "Token not found" would have been issued
			if ( tokenData.agentId !== tokenEngravedData.agentId )
			{
				callback( ErrorStatus.unauthorized( 'AgentId mismatch for this token.' ) ) ;
				return ;
			}

			//if ( tokenData.type !== auth.type )
			if ( Performer.tokenAcceptAuthType[ tokenData.type ].indexOf( auth.type ) === -1 )
			{
				callback( ErrorStatus.unauthorized( 'Auth method mismatch for this token' ) ) ;
				return ;
			}
			//*/

			// This is possible: expirationTime CAN be modified, for example by the RegenerateToken method
			// which set it a few seconds away from the action timepstamp
			if ( tokenData.expirationTime < now ) {
				// Token expired!
				throw ErrorStatus.unauthorized( 'This token has already expired (shortened).' ) ;
			}

			this._user = user ;

			return user ;
		} ,
		error => {
			this._user = false ;
			if ( error.type === 'notFound' ) { throw ErrorStatus.unauthorized( 'Non-existent user ID.' ) ; }
			throw error ;
		}
	) ;
} ;



Performer.prototype.getUserByApiKey = function( auth ) {
	var apiKeyEngravedData ;

	// Extract API Key data
	try {
		apiKeyEngravedData = this.app.collectionNodes.users.extractFromApiKey( auth.apiKey ) ;
	}
	catch ( error ) {
		return Promise.reject( ErrorStatus.badRequest( 'This is not a valid API Key' ) ) ;
	}

	//if ( apiKeyEngravedData.type !== auth.type )
	if ( Performer.tokenAcceptAuthType[ apiKeyEngravedData.type ].indexOf( auth.type ) === -1 ) {
		return Promise.reject( ErrorStatus.unauthorized( 'Auth method mismatch for this API Key' ) ) ;
	}


	// /!\ should get by id *AND* parent.id ??? /!\

	return this.app.collectionNodes.users.collection.get( apiKeyEngravedData.userId ).then(
		user => {
			var apiKeyData = user.apiKeys.find( apiKeyObject =>
				auth.apiKey.startsWith( apiKeyObject.start ) && apiKeyObject.hash === hash.password( auth.apiKey , apiKeyObject.salt , apiKeyObject.algo )
			) ;

			if ( ! apiKeyData ) {
				throw ErrorStatus.unauthorized( 'API Key not found.' ) ;
			}

			this._user = user ;

			return user ;
		} ,
		error => {
			this._user = false ;
			if ( error.type === 'notFound' ) { throw ErrorStatus.unauthorized( 'Non-existent user ID.' ) ; }
			throw error ;
		}
	) ;
} ;



// Should not be used outside internal optimization case
Performer.prototype._unconnected = function() {
	return this._user === false ;
} ;

