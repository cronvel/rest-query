/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query

	Copyright (c) 2015 Cédric Ronvel 
	
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



// Load modules
var events = require( 'events' ) ;

var ErrorStatus = require( 'error-status' ) ;





			/* Performer -- user performing the action */



function Performer() { throw new Error( '[restQuery] Cannot create a Performer object directly' ) ; }
module.exports = Performer ;

Performer.prototype = Object.create( events.prototype ) ;
Performer.prototype.constructor = Performer ;



Performer.create = function createPerformer( app , auth )
{
	var performer = Object.create( Performer.prototype , {
		app: { value: app } ,
		auth: { value: auth } ,
		accessCache: { value: new WeakMap() }
	} ) ;
	
	return performer ;
} ;



Performer.prototype.getUser = function getUser( callback )
{
	var self = this ;
	
	if ( self.getUserCache )
	{
		callback.apply( undefined , self.getUserCache ) ;
		return ;
	}
	else if ( self.getUserInProgress )
	{
		self.on( 'user' , callback ) ;
		return ;
	}
	
	self.getUserInProgress = true ;
	
	if ( self.auth )
	{
		self.getUserByAuth( self.auth , function( error , user ) {
			
			self.getUserInProgress = false ;
			self.getUserCache = Array.prototype.slice.call( arguments ) ;
			callback.apply( undefined , self.getUserCache ) ;
			self.emit( 'user' , error , user ) ;
		} ) ;
		
		return ;
	}
	
	// No user passed by auth: this is a non-connected performer (no user)
	self.getUserCache = [ undefined , null ] ;
	callback.apply( undefined , self.getUserCache ) ;
	self.emit( 'user' , undefined , null ) ;
} ;



Performer.prototype.getGroups = function getGroups( callback )
{
	var self = this ;
	
	if ( self.getGroupsCache )
	{
		callback.apply( undefined , self.getGroupsCache ) ;
		return ;
	}
	else if ( self.getGroupsInProgress )
	{
		self.on( 'groups' , callback ) ;
		return ;
	}
	
	self.getGroupsInProgress = true ;
	
	self.getUser( function( error , user ) {
		
		if ( ! user )
		{
			self.getGroupsInProgress = false ;
			self.getGroupsCache = [ undefined , [] ] ;
			self.getGroupsCache = Array.prototype.slice.call( arguments ) ;
			callback.apply( undefined , self.getGroupsCache ) ;
			self.emit( 'groups' , undefined , [] ) ;
			return ;
		}
		
		self.getGroupsByUserId( user.$.id , function( error , groups ) {
			
			self.getGroupsInProgress = false ;
			self.getGroupsCache = Array.prototype.slice.call( arguments ) ;
			callback.apply( undefined , self.getGroupsCache ) ;
			self.emit( 'groups' , error , groups ) ;
		} ) ;
	} ) ;
} ;



Performer.prototype.getUserByAuth = function getUserByAuth( auth , callback )
{
	var tokenEngravedData , user , now = Date.now() ;
	
	
	// Extract token data
	tokenEngravedData = this.app.collectionNodes.users.extractFromToken( auth.token ) ;
	//console.log( "tokenEngravedData:" , tokenEngravedData ) ;
	
	if ( tokenEngravedData.type !== auth.type )
	{
		callback( ErrorStatus.unauthorized( { message: 'Auth method mismatch for this token' } ) ) ;
		return ;
	}
	
	if ( tokenEngravedData.expirationTime * 1000 < now )
	{
		// Do not bother the database if the token has already expired!
		callback( ErrorStatus.unauthorized( { message: 'This token has already expired.' } ) ) ;
		return ;
	}
	
	//console.log( auth ) ;
	
	// /!\ should get by id *AND* parent.id ??? /!\
	
	this.app.collectionNodes.users.collection.get( tokenEngravedData.userId , function( error , user ) {
		
		var tokenData ;
		
		if ( error )
		{
			if ( error.type === 'notFound' ) { callback( ErrorStatus.unauthorized( { message: 'Non-existent user ID.' } ) ) ; }
			
			callback( error ) ;
			return ;
		}
		
		if ( ! user.token[ auth.token ] )
		{
			callback( ErrorStatus.unauthorized( { message: 'Token not found.' } ) ) ;
			return ;
		}
		
		tokenData = user.token[ auth.token ] ;
		
		//*	Not possible, a "Token not found" would have been issued
		if ( tokenData.agentId !== tokenEngravedData.agentId )
		{
			callback( ErrorStatus.unauthorized( { message: 'AgentId mismatch for this token.' } ) ) ;
			return ;
		}
		
		if ( tokenData.type !== auth.type )
		{
			callback( ErrorStatus.unauthorized( { message: 'Auth method mismatch for this token' } ) ) ;
			return ;
		}
		//*/
		
		// This is possible: expirationTime CAN be modified, for example by the RegenerateToken method
		// which set it a few seconds away from the action timepstamp
		if ( tokenData.expirationTime * 1000 < now )
		{
			// Token expired!
			callback( ErrorStatus.unauthorized( { message: 'This token has already expired (shortened).' } ) ) ;
			return ;
		}
		
		callback( undefined , user ) ;
	} ) ;
} ;



Performer.prototype.getGroupsByUserId = function getGroupsByUserId( userId , callback )
{
	var user ;
	
	//console.log( auth ) ;
	
	// /!\ should get by id *AND* parent.id /!\
	
	this.app.collectionNodes.groups.collection.find( { users: { $in: [ userId ] } } , function( error , groups ) {
		
		var i , groupIds = [] ;
		
		if ( error )
		{
			if ( error.type === 'notFound' ) { callback( undefined , [] ) ; }
			
			callback( error ) ;
			return ;
		}
		
		for ( i = 0 ; i < groups.length ; i ++ ) { groupIds[ i ] = groups[ i ].$.id ; }
		
		callback( undefined , groupIds ) ;
	} ) ;
} ;



