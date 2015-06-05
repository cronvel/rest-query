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
var path = require( 'path' ) ;
var string = require( 'string-kit' ) ;
var tree = require( 'tree-kit' ) ;
var odm = require( 'odm-kit' ) ;
var ErrorStatus = require( 'error-status' ) ;

var restQuery = require( './restQuery.js' ) ;





			/* App (Root Node) */



function App() { throw new Error( '[restQuery] Cannot create an App object directly, use createApp()' ) ; }
module.exports = App ;

App.prototype.constructor = App ;



App.create = function createApp( appConfig , override )
{
	var app ;
	
	if ( ! appConfig ) { appConfig = {} ; }
	
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
	
	if ( this instanceof App ) { app = this ; }
	else { app = Object.create( App.prototype ) ; }
	
	Object.defineProperties( app , {
		world: { value: odm.World() , enumerable: true } ,
		root: { value: app.createObjectNode( {} ) , enumerable: true } ,
		collections: { value: {} , enumerable: true } ,
		// used as callback, best to bind() to avoid userland's errors
		httpRequestHandler: { value: app.httpRequestHandler.bind( app ) , enumerable: true } ,
		httpOptions: { value: {} , enumerable: true }
	} ) ;
	
	app.configure( appConfig , override ) ;
	
	return app ;
} ;



App.prototype.configure = function configure( appConfig , override )
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
		var key ;
		
		for ( key in subtree )
		{
			parent.contains( collections[ key ] ) ;
			
			if ( subtree[ key ] && typeof subtree[ key ] === 'object' )
			{
				computeContains( collections[ key ] , subtree[ key ] ) ;
			}
		}
	} ;
	
	computeContains( this.root , appConfig.tree ) ;
	
	
	// Configure the server
	Object.defineProperties( this , {
		serverProtocol: { value: appConfig.protocol , enumerable: true } ,
		serverHost: { value: appConfig.host , enumerable: true } ,
		serverPort: { value: appConfig.port , enumerable: true } ,
		serverAbsoluteUrl: {
			enumerable: true ,
			value: appConfig.protocol + '://' + appConfig.host + ( appConfig.port === 80 ? '' : ':' + appConfig.port )
		}
	} ) ;
} ;



/*
	This method find all string value starting with @ and replace them, recursively, with a required .json file.
*/
App.prototype.expandConfig = function expandConfig( config , configPath )
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



App.prototype.createNode = function createNode( node , children )
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
App.prototype.setAllowOrigin = function setAllowOrigin( rule )
{
	this.httpOptions.allowOrigin = rule ;
} ;



App.prototype.createCollectionNode = function createCollectionNode( name , descriptor , collectionNode )
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



App.prototype.createUsersCollectionNode = function createUsersCollectionNode( descriptor , collectionNode )
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



App.prototype.createAuthCollectionNode = function createAuthCollectionNode( descriptor , collectionNode )
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
App.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	if ( ! objectNode ) { objectNode = Object.create( restQuery.ObjectNode.prototype ) ; }
	
	this.createNode( objectNode ) ;
	
	Object.defineProperties( objectNode , {
		object: { value: object , enumerable: true } ,
		id: { value: '/' , enumerable: true }
	} ) ;
	
	return objectNode ;
} ;



App.prototype.createPerformer = function createPerformer( options )
{
	if ( ! options ) { options = {} ; }
	
	var performer = Object.create( restQuery.Performer.prototype , {
		userID: { value: options.userID , enumerable: true } ,
		clientID: { value: options.clientID , enumerable: true } ,
		token: { value: options.token , enumerable: true }
	} ) ;
	
	return performer ;
} ;



App.prototype.httpRequestHandler = function httpRequestHandler( httpRequest , httpResponse )
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



App.prototype.httpErrorHandler = function httpErrorHandler( httpResponse , error )
{
	if ( error instanceof ErrorStatus ) { error.sendHttpHeaders( httpResponse ) ; }
	else { ErrorStatus.badRequest( { message: error.toString() } ).sendHttpHeaders( httpResponse ) ; }
	
	console.log( '[clientHandler] Error:' , error ) ;
	
	// Do it better later
	httpResponse.end() ;
} ;



