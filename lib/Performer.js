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



var ErrorStatus = require( 'error-status' ) ;





			/* Performer -- user performing the action */



function Performer() { throw new Error( '[restQuery] Cannot create a Performer object directly' ) ; }
module.exports = Performer ;

Performer.prototype.constructor = Performer ;



Performer.create = function createPerformer( app , auth )
{
	var performer = Object.create( Performer.prototype , {
		app: { value: app } ,
		auth: { value: auth }
	} ) ;
	
	return performer ;
} ;



Performer.prototype.getUser = function getUser( callback )
{
	var self = this ;
	
	if ( this.getUserCache )
	{
		callback.apply( undefined , this.getUserCache ) ;
		return ;
	}
	
	if ( this.auth )
	{
		this.getUserByAuth( this.auth , function( error , user ) {
			
			self.getUserCache = Array.prototype.slice.call( arguments ) ;
			callback.apply( undefined , self.getUserCache ) ;
		} ) ;
		
		return ;
	}
	
	// No user pass by auth: this non-connected performer (no user)
	this.getUserCache = [ undefined , null ] ;
	callback.apply( undefined , this.getUserCache ) ;
} ;



Performer.prototype.getUserByAuth = function getUserByAuth( auth , callback )
{
	var user ;
	
	console.log( auth ) ;
	
	this.app.collectionNodes.users.collection.get( auth.userId , { raw: true } , function( error , user ) {
		
		var token ;
		
		if ( error )
		{
			if ( error.type === 'notFound' ) { callback( ErrorStatus.unauthorized( { message: 'Non-existent user ID' } ) ) ; }
			
			callback( error ) ;
			return ;
		}
		
		if ( ! user.token[ auth.token ] )
		{
			callback( ErrorStatus.unauthorized( { message: 'Token not found' } ) ) ;
			return ;
		}
		
		token = user.token[ auth.token ] ;
		
		if ( token.agentId !== auth.agentId )
		{
			callback( ErrorStatus.unauthorized( { message: 'AgentId mismatch for this token' } ) ) ;
			return ;
		}
		
		if ( token.by !== auth.by )
		{
			callback( ErrorStatus.unauthorized( { message: 'Auth method mismatch for this token' } ) ) ;
			return ;
		}
		
		callback( undefined , user ) ;
	} ) ;
} ;


