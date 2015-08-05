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
var restQuery = require( './restQuery.js' ) ;

var ErrorStatus = require( 'error-status' ) ;
var doormen = require( 'doormen' ) ;
var hash = require( 'hash-kit' ) ;
var tree = require( 'tree-kit' ) ;





			/* UsersCollectionNode */



function UsersCollectionNode() { throw new Error( '[restQuery] Cannot create a UsersCollectionNode object directly' ) ; }
module.exports = UsersCollectionNode ;

UsersCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
UsersCollectionNode.prototype.constructor = restQuery.UsersCollectionNode ;



// WIP...

UsersCollectionNode.schema = tree.extend( { deep: true } , {} , restQuery.CollectionNode.schema , {
	
} ) ;



UsersCollectionNode.create = function createUsersCollectionNode( app , schema , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.UsersCollectionNode.prototype ) ; }
	
	//console.log( '\nIncoming schema:' , schema , '\n' ) ;
	doormen( UsersCollectionNode.schema , schema ) ;
	//console.log( '\nAfter doormen schema:' , schema ) ;
	
	schema.properties.isApiKey = { type: 'string' , default: false } ;	// if true, login is an API key and does not need a password
	schema.properties.login = { type: 'string' } ;
	
	schema.properties.password = {
		optional: true ,
		type: 'strictObject' ,
		properties: {
			hash: { type: 'string' } ,
			algo: { type: 'string', default: 'sha512' } ,
			salt: { type: 'string', default: '' }
		}
	} ;
	
	schema.properties.token = {
		type: 'strictObject' ,
		default: {} ,
		of: {
			type: 'strictObject',
			properties: {
				by: { in: [ 'header', 'cookie', 'queryString', 'urlAuth' , 'basicAuth' ] },
				agentId: { type: 'string' },
				creationTime: { type: 'number' },
				duration: { type: 'number' }
			}
		}
	} ;
	
	schema.hooks.beforeCreateDocument.push( beforeCreateDocumentHook ) ;
	
	schema.indexes.push( { properties: { login: 1 , "parent.id": 1 } , unique: true } ) ;
	
	// Call the parent constructor
	restQuery.CollectionNode.create( app , 'users' , schema , collectionNode ) ;
	
	// Add methods
	collectionNode.methods.createToken = UsersCollectionNode.prototype.createToken.bind( collectionNode ) ;
	
	return collectionNode ;
} ;



function beforeCreateDocumentHook( incomingDocument )
{
	var passwordObject , error ;
	
	if ( typeof incomingDocument.password === 'string' )
	{
		passwordObject = {
			algo: 'sha512',
			salt: hash.randomIdentifier( 10 )
		} ;
		
		passwordObject.hash = hash.password( incomingDocument.password , passwordObject.salt , passwordObject.algo ) ;
		
		incomingDocument.password = passwordObject ;
	}
	
	// Should it be solved userland?
	//if ( incomingDocument.slugId ) { incomingDocument.slugId = restQuery.slugify( incomingDocument.login ) ; }
	
	if ( incomingDocument.isApiKey )
	{
		if ( ! incomingDocument.login )
		{
			error = new Error( "When 'isApiKey' is set, it should contain a 'login' properties" ) ;
			error.validatorMessage = error.message ;
			throw error ;
		}
	}
	else
	{
		if ( ! incomingDocument.login || ! incomingDocument.password )
		{
			error = new Error( "When 'isApiKey' is NOT set, it should contain a 'login' and 'password' properties" ) ;
			error.validatorMessage = error.message ;
			throw error ;
		}
	}
	
	return incomingDocument ;
}



UsersCollectionNode.prototype.tokenGenerator = hash.createTokenGenerator( [
	{ key: 'creationTime' , type: 'timestamp' } ,
	{ key: 'increment' , type: 'increment16' } ,
	{ key: 'random' , type: 'random' , length: 3 } ,
	{ key: 'duration' , type: 'uint' , length: 2 } ,
	{ key: 'type' , type: 'BASE36' , length: 2 }
] ) ;



var createTokenSchema = {
	type: 'strictObject' ,
	properties: {
		by: { in: [ 'header', 'cookie', 'queryString', 'urlAuth' , 'basicAuth' ] },
		agentId: { type: 'string' },
		login: { type: 'string' },
		password: { type: 'string' }
	}
} ;



UsersCollectionNode.prototype.createToken = function createToken( path , incomingDocument , context , callback )
{
	var self = this ;
	
	try {
		doormen( createTokenSchema , incomingDocument ) ;
	}
	catch ( error ) {
		callback( error ) ;
		return ;
	}
	
	this.collection.getUnique( { login: incomingDocument.login, "parent.id": context.parentNode.id } , function( error , user ) {
		
		var token , timestamp = Date.now() ;
		
		if ( error )
		{
			//console.log( error ) ;
			callback( ErrorStatus.unauthorized( { message: "Unexistant login ID" } ) ) ;
			return ;
		}
		
		if ( user.password && typeof user.password === 'object' && typeof user.password.hash === 'string' )
		{
			// Account protected by a password
			if ( user.password.hash !== hash.password( incomingDocument.password , user.password.salt , user.password.algo ) )
			{
				callback( ErrorStatus.unauthorized( { message: "Bad password" } ) ) ;
				return ;
			}
		}
		
		var duration = 600 ;
		
		token = self.tokenGenerator.create( { duration: duration , type: 'H' } ) ;
		
		user.token[ token ] = {
			by: incomingDocument.by ,
			agentId: incomingDocument.agentId ,
			creationTime: timestamp ,
			duration: duration
		} ;
		
		user.$.save( function( error ) {
			callback( undefined , { userId: user.$.id , token: token } , {} ) ;
		} ) ;
	} ) ;
}



