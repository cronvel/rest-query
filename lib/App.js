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
	
	if ( this instanceof App ) { app = this ; }
	else { app = Object.create( App.prototype ) ; }
	
	Object.defineProperties( app , {
		world: { value: odm.World() , enumerable: true } ,
		root: { value: app.createObjectNode( {} ) , enumerable: true } ,
		collections: { value: {} , enumerable: true } ,
		httpOptions: { value: {} , enumerable: true }
	} ) ;
	
	app.configure( appConfig , override ) ;
	
	return app ;
} ;



App.prototype.configure = function configure( appConfig , override )
{
	var key ,
		collections = {} ,
		hasUsers = false , hasAuth = false ;
	
	appConfig = this.buildConfig( appConfig , override ) ;
	
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
	
	// TMP !!!
	this.setAllowOrigin( '*' ) ;
} ;



App.prototype.buildConfig = function buildConfig( appConfig , override )
{
	var configPath = '' ;
	
	if ( typeof appConfig === 'string' && path.extname( appConfig ) === '.json' )
	{
		configPath = path.dirname( appConfig ) + '/' ;
		appConfig = require( appConfig ) ;
		appConfig.configPath = configPath ;
	}
	
	// If no path can be found, use the Current Working Directory
	if ( ! appConfig.configPath ) { appConfig.configPath = process.cwd() + '/' ; }
	
	//console.log( ">>> path:" , appConfig.configPath ) ;
	
	this.expandConfig( appConfig , appConfig.configPath ) ;
	
	if ( override && typeof override === 'object' )
	{
		this.expandConfig( override , appConfig.configPath ) ;
		tree.extend( { deep: true } , appConfig , override ) ;
	}
	
	this.checkAndFixConfig( appConfig ) ;
	
	return appConfig ;
} ;



/*
	This method find all string value starting with @ and replace them, recursively, with a required .json file.
*/
App.prototype.expandConfig = function expandConfig( config , configPath )
{
	var key , includeFilePath , subtreePath , required , nextConfigPath , tmpStr ;
	
	for ( key in config )
	{
		if ( typeof config[ key ] === 'string' && config[ key ][ 0 ] === '@' )
		{
			tmpStr = config[ key ].slice( 1 ).split( ':' ) ;
			includeFilePath = tmpStr[ 0 ] ;
			subtreePath = tmpStr[ 1 ] ;
			
			//if ( path.extname( includeFilePath ) === '.json' )
			
			//nextConfigPath = path.dirname( configPath + includeFilePath ) + '/' ;
			try {
				required = require( configPath + includeFilePath ) ;
			}
			catch ( error ) {
				// TODO...
				throw error ;
			}
			
			if ( subtreePath ) { config[ key ] = tree.path.get( required , subtreePath ) ; }
			else { config[ key ] = required ; }
			
			if ( config[ key ] && typeof config[ key ] === 'object' )
			{
				//this.expandConfig( config[ key ] , nextConfigPath ) ;
				this.expandConfig( config[ key ] , configPath ) ;
			}
		}
		else if ( config[ key ] && typeof config[ key ] === 'object' )
		{
			this.expandConfig( config[ key ] , configPath ) ;
		}
	}
} ;



/*
	Check the config and fix it when it's possible.
	It should also log warning, when something is bad.
*/
App.prototype.checkAndFixConfig = function checkAndFixConfig( config )
{
	// I should build a validator lib here... I would be way simpler
	
	if ( typeof config.port === 'string' ) { config.port = parseInt( config.port , 10 ) ; }
	if ( ! config.port || typeof config.port !== 'number' || isNaN( config.port ) ) { config.port = 8080 ; }
	
	if ( ! config.host || typeof config.host !== 'string' ) { config.host = 'localhost' ; }
	
	if ( ! config.protocol || typeof config.protocol !== 'string' ) { config.protocol = 'http' ; }
} ;



// Set up the behaviour for CORS, argument can be a string or a function( OriginHeader ) that return a CORS path.
// Note that you don't have to give the full header, only the path.
// E.g.: '*' -> 'Access-Control-Allow-Origin: "*"'
App.prototype.setAllowOrigin = function setAllowOrigin( rule )
{
	this.httpOptions.allowOrigin = rule ;
} ;



App.prototype.run = function run()
{
	// Create the server
	restQuery.httpModule.createServer.call( this ) ;
} ;





			/* Shorthand */



App.prototype.createNode = function createNode( node , children )
{
	return restQuery.Node.create( this , node , children ) ;
} ;

App.prototype.createCollectionNode = function createCollectionNode( name , descriptor , collectionNode )
{
	return restQuery.CollectionNode.create( this , name , descriptor , collectionNode ) ;
} ;

App.prototype.createUsersCollectionNode = function createUsersCollectionNode( descriptor , collectionNode )
{
	return restQuery.UsersCollectionNode.create( this , descriptor , collectionNode ) ;
} ;

App.prototype.createAuthCollectionNode = function createUsersCollectionNode( descriptor , collectionNode )
{
	return restQuery.AuthCollectionNode.create( this , descriptor , collectionNode ) ;
} ;

// Here, we create a root node
App.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	return restQuery.ObjectNode.create( this , undefined , object , objectNode ) ;
} ;

App.prototype.createPerformer = function createPerformer( options )
{
	return restQuery.Performer.create( options ) ;
} ;



