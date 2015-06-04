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
var path = require( 'path' ) ;

var string = require( 'string-kit' ) ;
var tree = require( 'tree-kit' ) ;
var odm = require( 'odm-kit' ) ;
var ErrorStatus = require( 'error-status' ) ;





var restQuery = {} ;
module.exports = restQuery ;

restQuery.httpParser = require( './httpParser.js' ) ;
restQuery.charmap = require( './charmap.js' ) ;
restQuery.slugify = require( './slugify.js' ) ;





			/* App (Root Node) */



restQuery.App = function App() { throw new Error( '[restQuery] Cannot create an App object directly, use createApp()' ) ; } ;



restQuery.createApp = function createApp( appConfig , override )
{
	var app ;
	
	/*
	if ( ! appConfig || typeof appConfig !== 'object' )
	{
		throw new Error( "[restQuery] .createApp(): argument #0 should be an application's config" ) ;
	}
	*/
	
	/*	Default or mandatory?
	appConfig = {
		protocol: 'http' ,
		host: 'localhost' ,
		port: 80
	} ;
	*/
	
	if ( this instanceof restQuery.App ) { app = this ; }
	else { app = Object.create( restQuery.App.prototype ) ; }
	
	Object.defineProperties( app , {
		world: { value: odm.World() , enumerable: true } ,
		root: { value: app.createObjectNode( {} ) , enumerable: true } ,
		collections: { value: {} , enumerable: true } ,
		// used as callback, best to bind() to avoid userland's errors
		httpRequestHandler: { value: app.httpRequestHandler.bind( app ) , enumerable: true } ,
		httpOptions: { value: {} , enumerable: true }
	} ) ;
	
	app.configure( appConfig , override ) ;
	
	Object.defineProperties( app , {
		serverProtocol: { value: appConfig.protocol , enumerable: true } ,
		serverHost: { value: appConfig.host , enumerable: true } ,
		serverPort: { value: appConfig.port , enumerable: true } ,
		serverAbsoluteUrl: {
			enumerable: true ,
			value: appConfig.protocol + '://' + appConfig.host + ( appConfig.port === 80 ? '' : ':' + appConfig.port )
		}
	} ) ;
	
	return app ;
} ;

restQuery.App.prototype.constructor = restQuery.App ;



restQuery.App.prototype.configure = function configure( appConfig , override )
{
	var configPath = '' , key ,
		collections = {} ,
		hasUsers = false , hasAuth = false ;
	
	if ( typeof appConfig === 'string' && path.extname( appConfig ) === '.json' )
	{
		configPath = path.dirname( appConfig ) + '/' ;
		appConfig = require( appConfig ) ;
		appConfig.configPath = configPath ;
	}
	
	//console.log( ">>> path:" , appConfig.configPath ) ;
	
	this.expandConfig( appConfig , appConfig.configPath ) ;
	
	if ( override && typeof override === 'object' ) { tree.extend( { deep: true } , appConfig , override ) ; }
	
	//console.log( appConfig ) ;
	
	for ( key in appConfig.collections )
	{
		if ( ! appConfig.collections[ key ].url )
		{
			appConfig.collections[ key ].url = appConfig.defaultDomain + appConfig.collections[ key ].path ;
		}
		
		switch ( appConfig.collections[ key ].restQueryType )
		{
			case 'users' :
				if ( hasUsers ) { throw new Error( "[restQuery] .configure(): should not have two collections of the type 'users'" ) ; }
				hasUsers = true ;
				collections[ key ] = this.createUsersCollectionNode( appConfig.collections[ key ] ) ;
				break ;
			case 'auth' :
				if ( hasAuth ) { throw new Error( "[restQuery] .configure(): should not have two collections of the type 'auth'" ) ; }
				hasAuth = true ;
				collections[ key ] = this.createAuthCollectionNode( appConfig.collections[ key ] ) ;
				break ;
			default :
				collections[ key ] = this.createCollectionNode( key , appConfig.collections[ key ] ) ;
				break ;
		}
	}
	
	var computeContains = function computeContains( parent , subtree )
	{
		for ( key in subtree )
		{
			parent.contains( collections[ key ] ) ;
			
			if ( subtree[ key ] && typeof subtree[ key ] === 'object' )
			{
				computeContains( collections[ key ] , subtree[ key ] ) ;
			}
		}
	}
	
	computeContains( this.root , appConfig.tree ) ;
} ;



/*
	This method find all string value starting with @ and replace them, recursively, with a required .json file.
*/
restQuery.App.prototype.expandConfig = function expandConfig( config , configPath )
{
	var key , includeFilePath , nextConfigPath ;
	
	for ( key in config )
	{
		if ( typeof config[ key ] === 'string' && config[ key ][ 0 ] === '@' )
		{
			includeFilePath = config[ key ].slice( 1 ) ;
			
			if ( path.extname( includeFilePath ) === '.json' )
			{
				//nextConfigPath = path.dirname( configPath + includeFilePath ) + '/' ;
				config[ key ] = require( configPath + includeFilePath ) ;
				
				if ( config[ key ] && typeof config[ key ] === 'object' )
				{
					//this.expandConfig( config[ key ] , nextConfigPath ) ;
					this.expandConfig( config[ key ] , configPath ) ;
				}
			}
		}
		else if ( config[ key ] && typeof config[ key ] === 'object' )
		{
			this.expandConfig( config[ key ] , configPath ) ;
		}
	}
} ;



restQuery.App.prototype.createNode = function createNode( node , children )
{
	if ( ! node ) { node = Object.create( restQuery.Node.prototype ) ; }
	if ( ! children || typeof children !== 'object' ) { children = {} ; }
	
	Object.defineProperties( node , {
		app: { value: this , enumerable: true } ,
		children: { value: children , enumerable: true }
	} ) ;
	
	return node ;
} ;



// Set up the behaviour for CORS, argument can be a string or a function( OriginHeader ) that return a CORS path.
// Note that you don't have to give the full header, only the path.
// E.g.: '*' -> 'Access-Control-Allow-Origin: "*"'
restQuery.App.prototype.setAllowOrigin = function setAllowOrigin( rule )
{
	this.httpOptions.allowOrigin = rule ;
} ;



restQuery.App.prototype.createCollectionNode = function createCollectionNode( name , descriptor , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.CollectionNode.prototype ) ; }
	
	// Do not apply on derivative of CollectionNode, they should define their own defaults
	if ( collectionNode.__proto__.constructor === restQuery.CollectionNode )	// jshint ignore:line
	{
		descriptor.properties.SID = { constraint: 'SID' } ;
		descriptor.properties.title = { constraint: 'string' } ;
		descriptor.properties.parent = { constraint: 'object' } ;
		
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



// Here, we create a root node
restQuery.App.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	if ( ! objectNode ) { objectNode = Object.create( restQuery.ObjectNode.prototype ) ; }
	
	this.createNode( objectNode ) ;
	
	Object.defineProperties( objectNode , {
		object: { value: object , enumerable: true } ,
		id: { value: '/' , enumerable: true }
	} ) ;
	
	return objectNode ;
} ;



restQuery.App.prototype.createPerformer = function createPerformer( options )
{
	if ( ! options ) { options = {} ; }
	
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
	
	restQuery.httpParser.parseRequest( httpRequest , function( error , message ) {
		
		// First fix some header things
		httpResponse.setHeader( 'Content-Type' , 'application/json' ) ;
		
		// CORS
		if ( self.httpOptions.allowOrigin )
		{
			if ( typeof self.httpOptions.allowOrigin === 'string' )
			{
				httpResponse.setHeader( 'Access-Control-Allow-Origin' , self.httpOptions.allowOrigin ) ;
			}
			else if ( typeof self.httpOptions.allowOrigin === 'function' )
			{
				httpResponse.setHeader( 'Access-Control-Allow-Origin' , self.httpOptions.allowOrigin( httpRequest.headers.origin ) ) ;
			}
			
			httpResponse.setHeader( 'Access-Control-Allow-Methods' , 'OPTIONS, GET, PUT, PATCH, DELETE, POST' ) ;
			httpResponse.setHeader( 'Access-Control-Allow-Headers' , [ 'X-Token' , 'Content-Type' ] ) ;
		}
		
		// If an error occurs parsing the request, abort now
		if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
		
		//# debug : console.log( string.inspect( { style: 'color' } , message ) ) ;
		
		// Temp:
		performer = self.createPerformer( message ) ;
		
		switch ( message.method )
		{
			case 'options' :
				// We assume here a "pre-flight request" for checking CORS here...
				httpResponse.writeHeader( 200 ) ;
				httpResponse.end() ;
				break ;
			
			case 'get' :
				self.root.get( message.path , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
					
					httpResponse.writeHeader( 200 ) ;
					httpResponse.end( JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'post' :
				// Is it necessary here?
				if ( ! message.data ) { return self.httpErrorHandler( httpResponse , new Error( 'No message body...' ) ) ; }
				
				self.root.post( message.path , message.data , { performer: performer } , function( error , rawDocument , details ) {
					if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
					
					var status = details.status || 200 ;
					
					if ( status === 201 && rawDocument.id )
					{
						httpResponse.setHeader( 'Location' , self.serverAbsoluteUrl + httpRequest.url + '/' + rawDocument.id ) ;
					}
					
					httpResponse.writeHeader( status ) ;
					httpResponse.end( JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'put' :
				if ( ! message.data ) { return self.httpErrorHandler( httpResponse , new Error( 'No message body...' ) ) ; }
				
				self.root.put( message.path , message.data , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
					
					httpResponse.writeHeader( 201 ) ;
					httpResponse.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'patch' :
				if ( ! message.data ) { return self.httpErrorHandler( httpResponse , new Error( 'No message body...' ) ) ; }
				
				self.root.patch( message.path , message.data , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
					
					httpResponse.writeHeader( 200 ) ;
					httpResponse.end() ;	// JSON.stringify( rawDocument ) ) ;
					
				} ) ;
				break ;
			
			case 'delete' :
				self.root.delete( message.path , { performer: performer } , function( error , rawDocument ) {
					if ( error ) { return self.httpErrorHandler( httpResponse , error ) ; }
					
					httpResponse.writeHeader( 200 ) ;
					httpResponse.end() ;	// JSON.stringify( rawDocument ) ) ;
					
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



// autoSID: the current collection will be assumed if a SID is given
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



// Here we create an ObjectNode of part of the current CollectionNode
restQuery.CollectionNode.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	var id ;
	
	if ( ! objectNode ) { objectNode = Object.create( restQuery.ObjectNode.prototype ) ; }
	
	this.app.createNode( objectNode , this.children ) ;
	
	if ( object )
	{
		if ( object.id ) { id = object.id ; }
		else if ( object.$ && object.$.id ) { id = object.$.id ; }
		else { id = null ; }
	}
	else
	{
		id = null ;
	}
	
	Object.defineProperties( objectNode , {
		collectionNode: { value: this , enumerable: true } ,
		object: { value: object , enumerable: true } ,
		id: { value: id , enumerable: true }
	} ) ;
	
	return objectNode ;
} ;



restQuery.CollectionNode.prototype.get = function collectionNodeGet( path , context , callback )
{
	var self = this , parentCollectionName , fingerprint ;
	
	path = restQuery.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// First, check the ancestry chain: the current object should have
		// the previous object in the chain as its parent
		
		fingerprint = {} ;
		
		if ( context.parentNode && context.parentNode.id !== '/' )
		{
			parentCollectionName = context.parentNode.collectionNode.collection.name ;
			fingerprint[ 'parent.' + parentCollectionName ] = context.parentNode.id ;
		}
		
		this.collection.collect( fingerprint , function( error , batch ) {
			
			if ( error ) { callback( error ) ; return ; }
			
			//console.log( '&&&&&&&&&&&&&&&&&&&& ' , string.inspect( { style: 'color' } , batch ) ) ;
			
			// /!\ 'auth' should iterate through all objects, and filter them
			
			callback( undefined , batch.export() , {} ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				if ( error ) { callback( error ) ; return ; }
				
				// we instanciate an objectNode to query
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.get(
					path.slice( 1 ) ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.CollectionNode.prototype.post = function collectionNodePost( path , rawDocument , context , callback )
{
	var self = this , document , parentCollectionName , id ;
	
	
	path = restQuery.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		id = this.collection.createId( rawDocument ) ;
		rawDocument.parent = {} ;
		
		if ( context.parentNode && context.parentNode.id !== '/' )
		{
			parentCollectionName = context.parentNode.collectionNode.collection.name ;
			rawDocument.parent[ parentCollectionName ] = context.parentNode.id ;
		}
		
		//document = self.collection.createDocument( rawDocument , { id: id } ) ;
		document = self.collection.createDocument( rawDocument ) ;
		
		// overwrite:true for race conditions?
		document.save( { overwrite: true } , function( error ) {
			if ( error ) { callback( error ) ; return ; }
			
			callback( undefined , { id: id } , { status: 201 } ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				
				if ( error ) { callback( error ) ; }
				
				// The resource exists, overwrite or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.post(
					path.slice( 1 ) ,
					rawDocument ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.CollectionNode.prototype.put = function collectionNodePut( path , rawDocument , context , callback )
{
	var self = this , parentCollectionName ;
	
	
	path = restQuery.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a PUT on a collection node' } ) ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				
				if ( error )
				{
					if ( error.type === 'notFound' && path.length === 1 )
					{
						// This is a normal case: the target does not exist yet,
						// and should be created by the request
						
						rawDocument.parent = {} ;
						
						if ( context.parentNode && context.parentNode.id !== '/' )
						{
							parentCollectionName = context.parentNode.collectionNode.collection.name ;
							rawDocument.parent[ parentCollectionName ] = context.parentNode.id ;
						}
						
						document = self.collection.createDocument( rawDocument , { id: parsedPathNode.identifier } ) ;
						
						// overwrite:true for race conditions?
						document.save( { overwrite: true } , function( error ) {
							if ( error ) { callback( error ) ; return ; }
							callback( undefined , {} , { status: 201 } ) ;
						} ) ;
					}
					else
					{
						// Here this is really an error
						callback( error ) ;
					}
					
					return ;
				}
				
				// The resource exists, overwrite or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.put(
					path.slice( 1 ) ,
					rawDocument ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.CollectionNode.prototype.patch = function collectionNodePatch( path , rawDocument , context , callback )
{
	var self = this ;
	
	path = restQuery.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a PATCH on a collection node' } ) ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				// The resource exists, overwrite or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.patch(
					path.slice( 1 ) ,
					rawDocument ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.CollectionNode.prototype.delete = function collectionNodeDelete( path , context , callback )
{
	var self = this ;
	
	path = restQuery.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a DELETE on a collection node' } ) ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'ID' :
			this.collection.get( parsedPathNode.identifier , function( error , document ) {
				
				if ( error ) { callback( error ) ; return ; }
				
				// The resource exists, delete or access should be done by the underlying ObjectNode
				var objectNode = self.createObjectNode( document ) ;
				
				objectNode.delete(
					path.slice( 1 ) ,
					{ performer: context.performer , parentNode: context.parentNode } ,
					callback
				) ;
			} ) ;
			
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



restQuery.ObjectNode.prototype.get = function objectNodeGet( path , context , callback )
{
	var check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// Return that object!
		callback( undefined , this.object.export() , {} ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].get(
				path.slice( 1 ) ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.ObjectNode.prototype.post = function objectNodePost( path , rawDocument , context , callback )
{
	var document , check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a POST on an object node' } ) ) ;
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].post(
				path.slice( 1 ) ,
				rawDocument ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



// If this method is called, it means that the object *EXISTS*,
// put on an unexistant object is performed at collection-level
restQuery.ObjectNode.prototype.put = function objectNodePut( path , rawDocument , context , callback )
{
	var document , check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// If we are here, we are about to REPLACE an existing object
		
		//console.log( "@@@@@@@@@@@@@@@@@ this.object.id: " , this.object.id ) ;
		
		// It is not possible to overwrite the 'parent' property
		//console.log( '>>> Overwrite!' , string.inspect( { proto: true , style: 'color' } , this.object.$ ) ) ;
		//console.log( '>>> Overwrite!' , this.object.$.parent.blogs ) ;
		//console.log( '>>> Overwrite!' , this.object.$.parent ) ;
		
		rawDocument.parent = tree.extend( null , {} , this.object.$.parent ) ;
		//rawDocument.parent = this.object.$.parent ;
		
		document = this.object.collection.createDocument( rawDocument , { id: this.object.id } ) ;
		
		document.save( { overwrite: true } , function( error ) {
			if ( error ) { callback( error ) ; return ; }
			callback( undefined , {} , {} ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].put(
				path.slice( 1 ) ,
				rawDocument ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.ObjectNode.prototype.patch = function objectNodePatch( path , rawDocument , context , callback )
{
	var check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.pathToArray( path ) ;
	
	// /!\ 'auth' may forbid patch
	if ( path.length === 0 )
	{
		// /!\ 'auth' may forbid patch
		// /!\ That should be changed when 'auth' will be enforced
		
		//console.log( '>>> ' , rawDocument ) ;
		tree.extend( { deep: true , unflat: true } , this.object.$ , rawDocument ) ;
		delete this.object.$.parent ;	// Do not modify the parent
		//console.log( 'patch: ' , string.inspect( { style: 'color' , proto: true } , this.object.$ ) ) ;
		
		// When useMemProxy is on (ODM), this fails without any reason
		
		this.object.save( function( error ) {
			if ( error ) { callback( error ) ; return ; }
			callback( undefined , {} , {} ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].patch(
				path.slice( 1 ) ,
				rawDocument ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.ObjectNode.prototype.delete = function objectNodeDelete( path , context , callback )
{
	var check ;
	
	
	// Check auth
	check = this.checkAuth( context ) ;
	if ( check instanceof Error ) { callback( check ) ; return ; }
	
	
	path = restQuery.pathToArray( path ) ;
	
	if ( path.length === 0 )
	{
		// If we are here, we are about to DELETE an existing object
		
		// /!\ 'auth' may forbid the delete
		// /!\ That should be changed when 'auth' will be enforced
		this.object.delete( function( error ) {
			if ( error ) { callback( error ) ; return ; }
			callback( undefined , {} , {} ) ;
		} ) ;
		
		return ;
	}
	
	var parsedPathNode = restQuery.parsePathNode( path[ 0 ] ) ;
	//# debug : console.log( "parsedPathNode:" , parsedPathNode ) ;
	//# debug : console.log( "children:" , this.children ) ;
	
	if ( parsedPathNode instanceof Error ) { callback( parsedPathNode ) ; return ; }
	
	switch ( parsedPathNode.type )
	{
		case 'property':
			if ( ! this.children[ parsedPathNode.identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Property '" + path[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.children[ parsedPathNode.identifier ].delete(
				path.slice( 1 ) ,
				{ performer: context.performer , parentNode: this } ,
				callback
			) ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + path[ 0 ] + "' not found." } ) ) ;
			break ;
	}
} ;



restQuery.ObjectNode.prototype.checkAuth = function checkAuth( context )
{
	var parentCollectionName ;
	
	// First, check the ancestry chain: the current object should have
	// the previous object in the chain as its parent
	
	if ( context.parentNode && context.parentNode.id !== '/' )
	{
		/*
		console.log( "parent's id:" , context.parentNode.id ) ;
		//console.log( "parentNode :" , context.parentNode ) ;
		//console.log( "parent's collectionNode :" , context.parentNode.collectionNode ) ;
		//console.log( "parent collectionNode's collection:" , context.parentNode.collectionNode.collection ) ;
		console.log( "parent collection's name:" , context.parentNode.collectionNode.collection.name ) ;
		console.log( "object's parent:" , string.inspect( { style: 'color' , proto: true } , this.object.$.parent ) ) ;
		console.log( "object's parent ID:" , this.object.$.parent[ context.parentNode.collectionNode.collection.name ] ) ;
		*/
		
		parentCollectionName = context.parentNode.collectionNode.collection.name ;
		
		if ( 
			! this.object.$.parent ||
			! this.object.$.parent[ parentCollectionName ] ||
			context.parentNode.id.toString() !== this.object.$.parent[ parentCollectionName ].toString()
		)
		{
			return ErrorStatus.notFound( { message: "Ancestry mismatch." } ) ;
		}
	}
	
	return ;
} ;





			/* Performer -- user performing the action */



restQuery.Performer = function Performer() { throw new Error( '[restQuery] Cannot create a Performer object directly' ) ; } ;
restQuery.Performer.prototype.constructor = restQuery.Performer ;

//restQuery.Performer.prototype.




			/* Misc */



restQuery.pathToArray = function pathToArray( path )
{
	if ( typeof path === 'string' ) { path = path.split( '/' ) ; }
	if ( ! Array.isArray( path ) ) { throw new Error( "[restQuery] pathToArray() 'path' should be a string or an array" ) ; }
	if ( path[ 0 ] === '' ) { path = path.slice( 1 ) ; }
	if ( path[ path.length - 1 ] === '' ) { path = path.slice( 0 , path.length - 1 ) ; }
	//# debug : console.log( '[restQuery] pathToArray():' , path ) ;
	return path ;
} ;



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


