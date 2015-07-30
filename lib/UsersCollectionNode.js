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
	
	schema.properties.apiKey = { optional: true, type: 'string' } ;
	schema.properties.login = { optional: true, type: 'string' } ; // optional: can be an API-key
	
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
				creationTime: { type: 'number' },
				lastUseTime: { type: 'number' },
				agentId: { type: 'string' }
			}
		}
	} ;
	
	schema.hooks.beforeCreateDocument.push( beforeCreateDocumentHook ) ;
	
	schema.indexes.push( { properties: { login: 1 , "parent.id": 1 } , unique: true } ) ;
	
	// Call the parent constructor
	restQuery.CollectionNode.create( app , 'users' , schema , collectionNode ) ;
	
	// Add methods
	collectionNode.methods.createToken = createToken.bind( collectionNode ) ;
	
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
	
	if ( ! incomingDocument.apiKey && ( ! incomingDocument.login || ! incomingDocument.password ) )
	{
		error = new Error( "Should either provide the 'apiKey' property or provide the 'login' and the 'password' properties" ) ;
		error.validatorMessage = error.message ;
		throw error ;
	}
	
	return incomingDocument ;
}



var createTokenSchema = {
	type: 'strictObject' ,
	properties: {
		by: { in: [ 'header', 'cookie', 'queryString', 'urlAuth' , 'basicAuth' ] },
		agentId: { type: 'string' },
		login: { type: 'string' },
		password: { type: 'string' }
	}
} ;



function createToken( path , incomingDocument , context , callback )
{
	var self = this ;
	
	try {
		doormen( createTokenSchema , incomingDocument ) ;
	}
	catch ( error ) {
		callback( error ) ;
		return ;
	}
	
	this.collection.getUnique( { login: incomingDocument.login, "parent.id": '/' } , function( error , user ) {
		
		var token , timestamp = Date.now() ;
		
		if ( error )
		{
			//console.log( error ) ;
			callback( ErrorStatus.unauthorized( { message: "Unexistant login ID" } ) ) ;
			return ;
		}
		
		token = hash.uniqId() ;
		
		if ( user.password && typeof user.password === 'object' && typeof user.password.hash === 'string' )
		{
			// Account protected by a password
			if ( user.password.hash !== hash.password( incomingDocument.password , user.password.salt , user.password.algo ) )
			{
				callback( ErrorStatus.unauthorized( { message: "Bad password" } ) ) ;
				return ;
			}
		}
		
		user.token[ token ] = {
			by: incomingDocument.by ,
			agentId: incomingDocument.agentId ,
			creationTime: timestamp ,
			lastUseTime: timestamp
		} ;
		
		user.$.save( function( error ) {
			callback( undefined , { userId: user.$.id , token: token } , {} ) ;
		} ) ;
	} ) ;
}


