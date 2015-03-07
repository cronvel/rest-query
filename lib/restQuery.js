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

/*
	TODO:
		- remove binding in restQuery.App(), should probably turn those into functions...
		- handle connection/session
		- handle auth
*/



// Load modules
var url = require( 'url' ) ;

var string = require( 'string-kit' ) ;
var tree = require( 'tree-kit' ) ;
var odm = require( 'odm-kit' ) ;
var ErrorStatus = require( 'error-status' ) ;





var restQuery = {} ;
module.exports = restQuery ;

restQuery.charmap = require( './charmap.js' ) ;
restQuery.slugify = require( './slugify.js' ) ;





			/* App (Root Node) */



restQuery.App = function App() { throw new Error( '[restQuery] Cannot create an App object directly, use createApp()' ) ; } ;



restQuery.createApp = function createApp()
{
	var app ;
	
	if ( this instanceof restQuery.App ) { app = this ; }
	else { app = Object.create( restQuery.App.prototype ) ; }
	
	Object.defineProperties( app , {
		world: { value: odm.World() , enumerable: true } ,
		root: { value: app.createObjectNode( '/' ) , enumerable: true } ,
		collections: { value: {} , enumerable: true }
	} ) ;
	
	return app ;
} ;

restQuery.App.prototype.constructor = restQuery.App ;



restQuery.App.prototype.createNode = function createNode( node )
{
	if ( ! node ) { node = Object.create( restQuery.Node.prototype ) ; }
	
	Object.defineProperties( node , {
		app: { value: this , enumerable: true } ,
		children: { value: {} , enumerable: true }
	} ) ;
	
	return node ;
} ;



restQuery.App.prototype.createCollectionNode = function createCollectionNode( name , descriptor , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.CollectionNode.prototype ) ; }
	
	// Do not apply on derivative of CollectionNode, they should define their own defaults
	if ( collectionNode.__proto__.constructor === restQuery.CollectionNode )	// jshint ignore:line
	{
		descriptor.properties.SID = { constraint: 'SID' } ;
		descriptor.properties.title = { constraint: 'string' } ;
		
		// Here SID is not unique, also it should be unique for a given parent
		descriptor.indexes.push( { properties: { SID: 1 } } ) ;	//, unique: true } ) ;
	}
	
	this.createNode( collectionNode ) ;
	
	// First check the child name
	//var restQueryName = name[ 0 ].toUpperCase() + name.slice( 1 ) ;
	var restQueryName = name[ 0 ].toLowerCase() + name.slice( 1 ) ;
	
	// Then check the descriptor
	if ( ! descriptor || typeof descriptor !== 'object' ) { throw new Error( '[restQuery] the descriptor should be an object.' ) ; }
	if ( ! descriptor.properties || typeof descriptor.properties !== 'object' ) { descriptor.properties = {} ; }
	
	// Create the ODM collection
	var collection = this.world.createCollection( name , descriptor ) ;
	
	Object.defineProperties( collectionNode , {
		name: { value: restQueryName , enumerable: true } ,
		collection: { value: collection , enumerable: true }
	} ) ;
	
	return collectionNode ;
} ;



restQuery.App.prototype.createUsersCollectionNode = function createUsersCollectionNode( descriptor , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.UsersCollectionNode.prototype ) ; }
	
	descriptor.properties.SID = { constraint: 'SID' } ;
	descriptor.properties.email = { constraint: 'string' } ;
	descriptor.properties.passwordHash = { constraint: 'string' } ;
	descriptor.properties.lastConnection = { constraint: 'string' } ;
	//descriptor.properties.sessions = [] ;
	
	descriptor.indexes.push( { properties: { SID: 1 } , unique: true } ) ;
	descriptor.indexes.push( { properties: { email: 1 } } ) ;
	
	this.createCollectionNode( 'users' , descriptor , collectionNode ) ;
	
	return collectionNode ;
} ;



restQuery.App.prototype.createAuthCollectionNode = function createAuthCollectionNode( descriptor , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.AuthCollectionNode.prototype ) ; }
	
	descriptor.properties.collection = { constraint: 'string' } ;
	descriptor.properties.userID = { constraint: 'ID' } ;
	descriptor.properties.objectID = { constraint: 'ID' } ;
	
	descriptor.indexes.push( { properties: { userID: 1 , objectID: 1 , collection: 1 } , unique: true } ) ;
	
	this.createCollectionNode( 'auth' , descriptor , collectionNode ) ;
	
	return collectionNode ;
} ;



restQuery.App.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	if ( ! objectNode ) { objectNode = Object.create( restQuery.ObjectNode.prototype ) ; }
	
	this.createNode( objectNode ) ;
	
	Object.defineProperties( objectNode , {
		object: { value: object , enumerable: true }
	} ) ;
	
	return objectNode ;
} ;



restQuery.App.prototype.createPerformer = function createPerformer( options )
{
	var performer = Object.create( restQuery.Performer.prototype , {
		userID: { value: options.userID , enumerable: true } ,
		clientID: { value: options.clientID , enumerable: true } ,
		token: { value: options.token , enumerable: true }
	} ) ;
	
	return performer ;
} ;



restQuery.App.prototype.httpRequestHandler = function httpRequestHandler( httpRequest , httpResponse )
{
	var performer , self = this ;
	
	restQuery.parseHttpRequest( httpRequest , function( error , message ) {
		
		if ( error ) { return this.httpErrorHandler( httpResponse , error ) ; }
		
		console.log( string.inspect( { style: 'color' } , message ) ) ;
		
		performer = self.createPerformer( message ) ;
		
		switch ( message.method )
		{
			case 'get' :
				self.root.get( performer , message.path , function( error , rawDocument ) {
					if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
					
					httpResponse.writeHeader( 200 , { 'Content-Type': 'text/html' } ) ;
					httpResponse.end( JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'put' :
				self.root.put( performer , message.path , message.data , function( error , rawDocument ) {
					if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
					
					httpResponse.writeHeader( 201 , { 'Content-Type': 'text/html' } ) ;
					httpResponse.end() ;
					
				} ) ;
				break ;
			
			case 'patch' :
				self.root.patch( performer , message.path , message.data , function( error , rawDocument ) {
					if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
					
					httpResponse.writeHeader( 200 , { 'Content-Type': 'text/html' } ) ;
					httpResponse.end() ;
					
				} ) ;
				break ;
			
			case 'delete' :
				self.root.delete( performer , message.path , function( error , rawDocument ) {
					if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
					
					httpResponse.writeHeader( 200 , { 'Content-Type': 'text/html' } ) ;
					httpResponse.end() ;
					
				} ) ;
				break ;
			
			default:
				self.httpErrorHandler( httpResponse , error ) ;
		}
		
	} ) ;
} ;



restQuery.App.prototype.httpErrorHandler = function httpErrorHandler( httpResponse , error )
{
	if ( error instanceof ErrorStatus ) { error.sendHttpHeaders( httpResponse ) ; }
	else { ErrorStatus.badRequest( { message: error.toString() } ).sendHttpHeaders( httpResponse ) ; }
	
	console.log( '[clientHandler] Error:' , error ) ;
	
	// Do it better later
	httpResponse.end() ;
} ;






			/* Common Node -- shared between ObjectNode & CollectionNode */



restQuery.Node = function Node() { throw new Error( '[restQuery] Cannot create a Node object directly' ) ; } ;
restQuery.Node.prototype.constructor = restQuery.Node ;



// autoSID: the current collection is assumed if an SID is given
restQuery.Node.prototype.contains = function contains( collectionNode , autoSID )
{
	if ( ! ( collectionNode instanceof restQuery.CollectionNode ) ) { throw new Error( '[restQuery] .constains() require argument #0 to be an instance of restQuery.CollectionNode' ) ; }
	
	// First check the child name
	if ( this.children[ collectionNode.name ] ) { throw new Error( '[restQuery] Cannot attach over an existing child: ' + this.children[ collectionNode.name ] ) ; }
	this.children[ collectionNode.name ] = collectionNode ;
	
	//return odm.collection ;
} ;





			/* CollectionNode */



restQuery.CollectionNode = function CollectionNode() { throw new Error( '[restQuery] Cannot create a CollectionNode object directly' ) ; } ;
restQuery.CollectionNode.prototype = Object.create( restQuery.Node.prototype ) ;
restQuery.CollectionNode.prototype.constructor = restQuery.CollectionNode ;

restQuery.UsersCollectionNode = function UsersCollectionNode() { throw new Error( '[restQuery] Cannot create a UsersCollectionNode object directly' ) ; } ;
restQuery.UsersCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
restQuery.UsersCollectionNode.prototype.constructor = restQuery.UsersCollectionNode ;

restQuery.AuthCollectionNode = function AuthCollectionNode() { throw new Error( '[restQuery] Cannot create a AuthCollectionNode object directly' ) ; } ;
restQuery.AuthCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
restQuery.AuthCollectionNode.prototype.constructor = restQuery.AuthCollectionNode ;



restQuery.CollectionNode.prototype.get = function collectionNodeGet( performer , path , callback )
{
	var self = this ;
	
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { callback( new Error( '[restQuery] .access() argument #1 should be a string or an array' ) ) ; return ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	console.log( '[CollectionNode] Path:' , path ) ;
	
	if ( path.length === 0 ) { callback( undefined , this.object ) ; return ; }
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	console.log( "parsedPathNode:" , parsedPathNode ) ;
	console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				if ( error ) { callback( error ) ; return ; }
				var objectNode = self.app.createObjectNode( document ) ;
				objectNode.get( performer , path.slice( 1 ) , callback ) ;
			} ) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.CollectionNode.prototype.put = function collectionNodePut( performer , path , rawDocument , callback )
{
	var self = this ;
	
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { callback( new Error( '[restQuery] .access() argument #1 should be a string or an array' ) ) ; return ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	console.log( '[CollectionNode] Path:' , path ) ;
	
	if ( path.length === 0 ) { callback( ErrorStatus.badRequest( { message: 'Cannot perform a PUT on a collection node' } ) ) ; return ; }
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	console.log( "parsedPathNode:" , parsedPathNode ) ;
	console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			if ( path.length === 1 )
			{
				var document = this.collection.createDocument( rawDocument , { id: parsedPathNode.identifier } ) ;
				
				// /!\ That should be changed when 'auth' will be enforced
				//document.save( function( error ) {
				document.save( { overwrite: true } , function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			}
			else
			{
				this.collection.get( parsedPathNode.identifier , function( error , document ) {
					if ( error ) { callback( error ) ; return ; }
					var objectNode = self.app.createObjectNode( document ) ;
					objectNode.put( performer , path.slice( 1 ) , rawDocument , callback ) ;
				} ) ;
			}
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.CollectionNode.prototype.patch = function collectionNodePatch( performer , path , rawDocument , callback )
{
	var self = this ;
	
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { callback( new Error( '[restQuery] .access() argument #1 should be a string or an array' ) ) ; return ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	console.log( '[CollectionNode] Path:' , path ) ;
	
	if ( path.length === 0 ) { callback( ErrorStatus.badRequest( { message: 'Cannot perform a PATCH on a collection node' } ) ) ; return ; }
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	console.log( "parsedPathNode:" , parsedPathNode ) ;
	console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			if ( path.length === 1 )
			{
				var document = this.collection.get( parsedPathNode.identifier ) ;
				tree.extend( { deep: true } , document.$ , rawDocument ) ;
				
				// /!\ That should be changed when 'auth' will be enforced
				//document.save( function( error ) {
				document.save( function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			}
			else
			{
				this.collection.get( parsedPathNode.identifier , function( error , document ) {
					if ( error ) { callback( error ) ; return ; }
					var objectNode = self.app.createObjectNode( document ) ;
					objectNode.patch( performer , path.slice( 1 ) , rawDocument , callback ) ;
				} ) ;
			}
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.CollectionNode.prototype.delete = function collectionNodeDelete( performer , path , callback )
{
	var self = this ;
	
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { callback( new Error( '[restQuery] .access() argument #1 should be a string or an array' ) ) ; return ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	console.log( '[CollectionNode] Path:' , path ) ;
	
	if ( path.length === 0 ) { callback( ErrorStatus.badRequest( { message: 'Cannot perform a DELETE on a collection node' } ) ) ; return ; }
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	console.log( "parsedPathNode:" , parsedPathNode ) ;
	console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			if ( path.length === 1 )
			{
				var document = this.collection.get( parsedPathNode.identifier ) ;
				
				// /!\ That should be changed when 'auth' will be enforced
				//document.save( function( error ) {
				document.delete( function( error ) {
					if ( error ) { callback( error ) ; return ; }
					callback() ;
				} ) ;
			}
			else
			{
				this.collection.get( parsedPathNode.identifier , function( error , document ) {
					if ( error ) { callback( error ) ; return ; }
					var objectNode = self.app.createObjectNode( document ) ;
					objectNode.delete( performer , path.slice( 1 ) , callback ) ;
				} ) ;
			}
			
			break ;
			
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



// Probably useless here
/*
// autoSID: the current collection is assumed if an SID is given
restQuery.CollectionNode.prototype.contains = function contains( name , descriptor , autoSID )
{
	// First check the child name
	var childName = name[ 0 ].toUpperCase() + name.slice( 1 ) ;
	if ( this.children[ childName ] ) { throw new Error( '[restQuery] Cannot attach over an existing child: ' + childName ) ; }
	
	// Then check the descriptor
	if ( ! descriptor || typeof descriptor !== 'object' ) { throw new Error( '[restQuery] the descriptor should be an object.' ) ; }
	if ( ! descriptor.properties || typeof descriptor.properties !== 'object' ) { descriptor.properties = {} ; }
	
	descriptor.properties.SID = { constraint: 'SID' } ;
	descriptor.properties.title = { constraint: 'string' } ;
	
	// Create the collection
	this.children[ childName ] = this.app.world.createCollection( name , descriptor ) ;
	
	//return odm.collection ;
} ;
*/





			/* Object Node */



restQuery.ObjectNode = function ObjectNode() { throw new Error( '[restQuery] Cannot create a ObjectNode object directly' ) ; } ;
restQuery.ObjectNode.prototype = Object.create( restQuery.Node.prototype ) ;
restQuery.ObjectNode.prototype.constructor = restQuery.ObjectNode ;



restQuery.ObjectNode.prototype.get = function objectNodeGet( performer , path , callback )
{
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { callback( new Error( '[restQuery] .access() argument #1 should be a string or an array' ) ) ; return ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	console.log( '[ObjectNode] Path:' , path ) ;
	
	if ( path.length === 0 )
	{
		callback( undefined , this.object.export() ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	console.log( "parsedPathNode:" , parsedPathNode ) ;
	console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			this.children[ parsedPathNode.identifier ].get( performer , path.slice( 1 ) , callback ) ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.ObjectNode.prototype.put = function objectNodePut( performer , path , rawDocument , callback )
{
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { callback( new Error( '[restQuery] .access() argument #1 should be a string or an array' ) ) ; return ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	console.log( '[ObjectNode] Path:' , path ) ;
	
	// The PUT query itself is not supposed to happened here, it should happened on the parent node.
	// /!\ What happened on existing document? ('auth' may forbid overwriting)
	if ( path.length === 0 ) { callback( ErrorStatus.badRequest( { message: 'Cannot perform a PUT on the last node' } ) ) ; return ; }
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	console.log( "parsedPathNode:" , parsedPathNode ) ;
	console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			this.children[ parsedPathNode.identifier ].put( performer , path.slice( 1 ) , rawDocument , callback ) ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.ObjectNode.prototype.patch = function objectNodePatch( performer , path , rawDocument , callback )
{
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { callback( new Error( '[restQuery] .access() argument #1 should be a string or an array' ) ) ; return ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	console.log( '[ObjectNode] Path:' , path ) ;
	
	// The PATCH query itself is not supposed to happened here, it should happened on the parent node.
	// /!\ What happened on existing document? ('auth' may forbid overwriting)
	if ( path.length === 0 ) { callback( ErrorStatus.badRequest( { message: 'Cannot perform a PATCH on the last node' } ) ) ; return ; }
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	console.log( "parsedPathNode:" , parsedPathNode ) ;
	console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			this.children[ parsedPathNode.identifier ].patch( performer , path.slice( 1 ) , rawDocument , callback ) ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.ObjectNode.prototype.delete = function objectNodeDelete( performer , path , callback )
{
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { callback( new Error( '[restQuery] .access() argument #1 should be a string or an array' ) ) ; return ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	console.log( '[ObjectNode] Path:' , path ) ;
	
	// The DELETE query itself is not supposed to happened here, it should happened on the parent node.
	// /!\ What happened on existing document? ('auth' may forbid overwriting)
	if ( path.length === 0 ) { callback( ErrorStatus.badRequest( { message: 'Cannot perform a DELETE on the last node' } ) ) ; return ; }
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	console.log( "parsedPathNode:" , parsedPathNode ) ;
	console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			this.children[ parsedPathNode.identifier ].delete( performer , path.slice( 1 ) , callback ) ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;





			/* HTTP request parser */



restQuery.MAX_DATA_SIZE = 100000 ;	// 100k
var deb = function( v ) { console.log( string.inspect( { style: 'color' , depth:2 } , v ) ) ; } ;

restQuery.httpMethods = [ 'get' , 'put' , 'patch' , 'delete' , 'post' ] ;

// Parse an HTTP request and return a message
restQuery.parseHttpRequest = function parseHttpRequest( httpRequest , callback )
{
	var length , message = {} , parsed , splitted , token ;
	deb( httpRequest ) ;
	
	// First, parse the URL
	parsed = url.parse( httpRequest.url , true ) ;
	//deb( parsed ) ;
	
	// Split the path to separate the extension part
	splitted = parsed.pathname.split( /\.(?!.*[\/.])/ ) ;
	message.path = splitted[ 0 ] ;
	message.type = splitted[ 1 ] || 'json' ;
	
	// Get the host without the port
	message.host = httpRequest.headers.host.split( ':' )[ 0 ] ;
	
	// Populate the method, lowercased
	if ( parsed.query.method ) { message.method = parsed.query.method.toLowerCase() ; delete parsed.query.method ; }
	else { message.method = httpRequest.method.toLowerCase() ; }
	
	// If it is not a restQuery method, leave now with an error message
	if ( restQuery.httpMethods.indexOf( message.method ) === -1 )
	{
		callback( ErrorStatus.methodNotAllowed( "Method: '" + message.method + "' is not allowed." ) ) ;
		return ;
	}
	
	// Get the token, whatever the way...
	// TODO: get it from cookies, think of the priority, etc...
	token = httpRequest.headers['x-token'] || parsed.query.token ;
	delete parsed.query.token ;
	
	// Parse the token
	if ( token )
	{
		splitted = token.split( '-' ) ;
		message.userId = splitted[ 0 ] ;
		message.clientId = splitted[ 1 ] ;
		message.token = splitted[ 2 ] ;
	}
	
	
	// Reference the remaining query's variable into the message
	message.params = parsed.query ;
	
	length = parseInt( httpRequest.headers['content-length'] ) ;
	
	/* temp!
	message.headers = httpRequest.headers ;
	//*/
	
	if ( httpRequest.method !== 'get' && length > 0 )
	{
		if ( length > restQuery.MAX_DATA_SIZE )
		{
			callback( new Error( '[restQuery] parseHttpRequest() MAX_DATA_SIZE reached' ) ) ;
			return ;
		}
		
		restQuery.getBody( httpRequest , length , function( error , body ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			try {
				message.data = JSON.parse( body ) ;
			}
			catch ( error ) {
				callback( new Error( '[restQuery] parseHttpRequest() content is not valid JSON' ) ) ;
				return ;
			}
			
			callback( undefined , message ) ;
		} ) ;
		
		return ;
	}
	
	callback( undefined , message ) ;
} ;



// Get the whole body of a request
restQuery.getBody = function getBody( stream , maxLength , callback )
{
	var body = '' , length = 0 ;
	
	var onData = function( chunk ) {
		
		length += chunk.length ;
		
		if ( length > maxLength )
		{
			stream.pause() ;
			stream.removeListener( 'data' , onData ) ;
			stream.removeListener( 'end' , onEnd ) ;
			callback( new Error( 'HTTP body length mismatch' ) ) ;
			return ;
		}
		
		body += chunk.toString() ;
	} ;
	
	var onEnd = function() {
		callback( undefined , body ) ;
	} ;
	
	stream.on( 'data' , onData ) ;
	stream.on( 'end' , onEnd ) ;
} ;





			/* Performer -- user performing the action */



restQuery.Performer = function Performer() { throw new Error( '[restQuery] Cannot create a Performer object directly' ) ; } ;
restQuery.Performer.prototype.constructor = restQuery.Performer ;

//restQuery.Performer.prototype.




			/* Misc */



restQuery.parsePathNode = function parsePathNode( str )
{
	if ( typeof str !== 'string' ) { return new TypeError( '[restQuery] objectString() : argument #0 should be a string' ) ; }
	
	if ( str.length < 1 ) { return new Error( '[restQuery] objectString() : argument #0 length should be > 1' ) ; }
	if ( str.length > 72 ) { return new Error( '[restQuery] objectString() : argument #0 length should be <= 72' ) ; }
	
	
	// Firstly, check if it is an object's property (or method): it starts with an uppercase ascii letter
	if ( restQuery.charmap.uppercaseArray.indexOf( str[ 0 ] ) !== -1 )
	{
		if ( ! str.match( restQuery.charmap.propertyRegExp ) )
		{
			return new Error( '[restQuery] objectString() : argument #0 start with an uppercase but mismatch an object property type' ) ;
		}
		
		return {
			type: 'property' ,
			identifier: str[ 0 ].toLowerCase() + str.slice( 1 )
		} ;
	}
	
	// Secondly, check if it is an ID: it is a 24 characters string containing only hexadecimal
	if ( str.length === 24 && str.match( restQuery.charmap.idRegExp ) )
	{
		return {
			type: 'ID' ,
			identifier: str
		} ;
	}
	
	// Thirdly, check if it is an offset
	if ( str.match( restQuery.charmap.offsetRegExp ) )
	{
		return {
			type: 'offset' ,
			identifier: parseInt( str )
		} ;
	}
	
	// Fourthly, check if it is a SID
	if ( str.match( restQuery.charmap.sidRegExp ) )
	{
		return {
			type: 'SID' ,
			identifier: str
		} ;
	}
	
	// Nothing had matched... this is not a valid path node
	return new Error( '[restQuery] objectString() : argument #0 does not validate' ) ;
} ;
