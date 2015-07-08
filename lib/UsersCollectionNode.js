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





			/* UsersCollectionNode */



function UsersCollectionNode() { throw new Error( '[restQuery] Cannot create a UsersCollectionNode object directly' ) ; }
module.exports = UsersCollectionNode ;

UsersCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
UsersCollectionNode.prototype.constructor = restQuery.UsersCollectionNode ;



UsersCollectionNode.create = function createUsersCollectionNode( app , schema , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.UsersCollectionNode.prototype ) ; }
	
	//--------------------------------------- SHOULD create the SID type checker -----------------------------------------------
	
	if ( ! schema.properties ) { schema.properties = {} ; }
	
	schema.properties.SID = {} ; // { type: 'SID' } ;
	schema.properties.apiKey = { optional: true, type: 'string' } ;
	schema.properties.login = { optional: true, type: 'string' } ; // optional: can be an API-key
	schema.properties.parent = { optional: true } ; // { type: 'object' } ;
	
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
				by: { in: [ 'header', 'cookie', 'queryString', 'urlAuth' ] },
				creationTime: { type: 'number' },
				lastUseTime: { type: 'number' },
				agentId: { type: 'string' }
			}
		}
	} ;
	
	// unique?
	schema.indexes.push( { properties: { SID: 1 } /*, unique: true*/ } ) ;
	schema.indexes.push( { properties: { login: 1 } , unique: true } ) ;
	
	// Call the parent constructor
	restQuery.CollectionNode.create( app , 'users' , schema , collectionNode ) ;
	
	// Add methods
	collectionNode.methods.createToken = createToken.bind( collectionNode ) ;
	
	return collectionNode ;
} ;



var createTokenSchema = {
	type: 'strictObject' ,
	properties: {
		by: { in: [ 'header', 'cookie', 'queryString', 'urlAuth' ] },
		agentId: { type: 'string' },
		login: { type: 'string' },
		password: { type: 'string' }
	}
} ;



function createToken( path , rawDocument , context , callback )
{
	var self = this ;
	
	try {
		doormen( createTokenSchema , rawDocument ) ;
	}
	catch ( error ) {
		callback( error ) ;
		return ;
	}
	
	this.collection.getUnique( { login: rawDocument.login } , function( error , user ) {
		
		var token , timestamp = Date.now() ;
		
		if ( error )
		{
			callback( ErrorStatus.unauthorized( { message: "Unexistant login ID" } ) ) ;
			return ;
		}
		
		token = hash.uniqId() ;
		
		if ( user.$.password && typeof user.$.password === 'object' && typeof user.$.password.hash === 'string' )
		{
			// Account protected by a password
			if ( user.$.password.hash !== hash.password( rawDocument.password , user.$.password.salt , user.$.password.algo ) )
			{
				callback( ErrorStatus.unauthorized( { message: "Bad password" } ) ) ;
				return ;
			}
		}
		
		user.$.token[ token ] = {
			by: rawDocument.by ,
			agentId: rawDocument.agentId ,
			creationTime: timestamp ,
			lastUseTime: timestamp
		} ;
		
		user.save( function( error ) {
			callback( undefined , { userId: user.$._id , token: token } , {} ) ;
		} ) ;
	} ) ;
}

