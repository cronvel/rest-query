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

var kungFig = require( 'kung-fig' ) ;
var doormen = require( 'doormen' ) ;
var async = require( 'async-kit' ) ;
var string = require( 'string-kit' ) ;
var tree = require( 'tree-kit' ) ;
var rootsDb = require( 'roots-db' ) ;
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
		world: { value: rootsDb.World() , enumerable: true } ,
		collectionNodes: { value: {} , enumerable: true } ,
		httpOptions: { value: {} , enumerable: true }
	} ) ;
	
	app.configure( appConfig , override ) ;
	
	return app ;
} ;



App.prototype.configure = function configure( appConfig , override )
{
	var key ,
		collections = {} ,
		hasUsers = false , hasGroups = false ;
	
	// Load the whole config using Kung-Fig
	appConfig = kungFig.load( appConfig ) ;
	//tree.extend( { deep: true , own: true } , appConfig , override ) ;
	if ( override ) { kungFig.reduce( appConfig , override ) ; }
	
	// Fix the config
	this.checkAndFixConfig( appConfig ) ;
	
	
	// Now we have a clean config! Let's process it!
	
	Object.defineProperties( this , {
		buildIndexesAtStartup: { value: appConfig.buildIndexes , enumerable: true , writable: true } ,
		serverProtocol: { value: appConfig.protocol , enumerable: true } ,
		serverHost: { value: appConfig.host , enumerable: true } ,
		serverPort: { value: appConfig.port , enumerable: true } ,
		serverAbsoluteUrl: {
			enumerable: true ,
			value: appConfig.protocol + '://' + appConfig.host + ( appConfig.port === 80 ? '' : ':' + appConfig.port )
		} ,
		tokenDuration: { value: appConfig.tokenDuration , enumerable: true , writable: true } ,
		autoCollection: { value: appConfig.rootAutoCollection , enumerable: true , writable: true } ,
	} ) ;
	
	
	// Create the root object, it needs a configured app (app.autoCollection is needed),
	// so it should come after app's property definition
	Object.defineProperty( this , 'root' , { value: this.createObjectNode( appConfig.rootObject ) , enumerable: true } ) ;
	
	
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
			case 'groups' :
				if ( hasGroups ) { throw new Error( "[restQuery] .configure(): should not have two collections of the type 'groups'" ) ; }
				hasGroups = true ;
				collections[ key ] = this.createGroupsCollectionNode( appConfig.collections[ key ] ) ;
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
	
	
	
	// TMP !!!
	this.setAllowOrigin( '*' ) ;
} ;



App.configSchema = {
	type: 'strictObject' ,
	extraProperties: true ,
	properties: {
		buildIndexes: { type: 'boolean' , default: false } ,
		port: { type: 'integer' , sanitize: 'toNumber' , default: 8080 } ,
		host: { type: 'host' , default: 'localhost' } ,
		protocol: { type: 'string' , default: 'http' , in: [ 'http' , 'https' , 'ws' , 'wss' ] } ,
		tokenDuration: { type: 'integer' , default: 900000 } ,
		rootAutoCollection: { type: 'string' , default: null } ,
		rootObject: {
			type: 'strictObject' ,
			default: {
				inheritAccess: 'none' ,
				userAccess: {} ,
				groupAccess: {} ,
				otherAccess: 'readCreate'
			} ,
			extraProperties: true ,
			properties: {
				inheritAccess: {
					type: 'restQuery.inheritAccess' ,
					default: 'none'
				} ,
				userAccess: {
					type: 'strictObject' ,
					default: {} ,
					keys: { type: 'restQuery.id' } ,
					of: { type: 'restQuery.accessLevel' }
				} ,
				groupAccess: {
					type: 'strictObject' ,
					default: {} ,
					keys: { type: 'restQuery.id' } ,
					of: { type: 'restQuery.accessLevel' }
				} ,
				otherAccess: {
					type: 'restQuery.accessLevel' ,
					default: 'readCreate'
				}
			}
		}
	}
} ;



/*
	Check the config and fix few things (cast, etc).
*/
App.prototype.checkAndFixConfig = function checkAndFixConfig( config )
{
	doormen( App.configSchema , config ) ;
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
	var self = this ;
	
	if ( this.buildIndexesAtStartup )
	{
		this.buildIndexesAtStartup = false ;
		console.log( "Build indexes..." ) ;
		
		this.buildIndexes( function( error ) {
			//if ( error ) {}	// What should be done here?
			console.log( "Indexes rebuilt!" ) ;
			self.run() ;	// run again
		} ) ;
		
		return ;
	}
	
	// Create the server
	restQuery.httpModule.createServer.call( this ) ;
} ;



App.prototype.buildIndexes = function buildIndexes( callback )
{
	async.foreach( this.world.collections , function( collection , name , foreachCallback ) {
		collection.buildIndexes( foreachCallback ) ;
	} )
	.exec( callback ) ;
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

App.prototype.createGroupsCollectionNode = function createGroupsCollectionNode( descriptor , collectionNode )
{
	return restQuery.GroupsCollectionNode.create( this , descriptor , collectionNode ) ;
} ;

// Here, we create a root node
App.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	return restQuery.ObjectNode.create( this , undefined , object , objectNode ) ;
} ;

App.prototype.createPerformer = function createPerformer( auth )
{
	return restQuery.Performer.create( this , auth ) ;
} ;



