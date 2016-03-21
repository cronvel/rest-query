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

"use strict" ;



// Load modules
var path = require( 'path' ) ;

var kungFig = require( 'kung-fig' ) ;
var doormen = require( 'doormen' ) ;
var async = require( 'async-kit' ) ;
var string = require( 'string-kit' ) ;
var tree = require( 'tree-kit' ) ;
var rootsDb = require( 'roots-db' ) ;
var ErrorStatus = require( 'error-status' ) ;

var Logfella = require( 'logfella' ) ;
var log = Logfella.global.use( 'rest-query' ) ;

var restQuery = require( './restQuery.js' ) ;

function noop() {}





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
		world: { value: rootsDb.World.create() , enumerable: true } ,
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
		hasUsers = false , hasGroups = false , hasScheduledTasks = false ;
	
	// Load the whole config using Kung-Fig
	appConfig = kungFig.load( appConfig ) ;
	//tree.extend( { deep: true , own: true } , appConfig , override ) ;
	if ( override ) { kungFig.reduce( appConfig , override ) ; }
	
	// Fix the config
	this.checkAndFixConfig( appConfig ) ;
	
	
	// Now we have a clean config! Let's process it!
	
	Object.defineProperties( this , {
		config: { value: appConfig , enumerable: true } ,
		data: { value: appConfig.data , enumerable: true } ,	// contains user-land data
		usr: { value: appConfig.usr , enumerable: true } ,		// contains user-land helpers, global objects, etc...
		buildIndexesAtStartup: { value: appConfig.buildIndexes , enumerable: true , writable: true } ,
		serverProtocol: { value: appConfig.protocol , enumerable: true } ,
		serverHost: { value: appConfig.host , enumerable: true } ,
		serverPort: { value: appConfig.port , enumerable: true } ,
		serverAbsoluteUrl: {
			enumerable: true ,
			value: appConfig.protocol + '://' + appConfig.host + ( appConfig.port === 80 ? '' : ':' + appConfig.port )
		} ,
		tokenDuration: { value: appConfig.tokenDuration , enumerable: true , writable: true } ,
		rootAutoCollection: { value: appConfig.rootAutoCollection , enumerable: true , writable: true } ,
		rootMethods: { value: appConfig.rootMethods , enumerable: true , writable: true } ,
		
		initHook: { value: appConfig.hooks.init && appConfig.hooks.init.bind( this ) , enumerable: true } ,
		workers: { value: appConfig.workers , enumerable: true } ,
		scheduler: {
			value: appConfig.scheduler.active ? restQuery.Scheduler.create( this , appConfig.scheduler ) : null ,
			enumerable: true ,
			writable: true
		}
	} ) ;
	
	
	// Configure Logfella NOW!
	Logfella.global.setGlobalConfig( appConfig.log ) ;
	
	// Init monitoring
	tree.extend( null , Logfella.global.mon , {
		requests: 0
	} ) ;
	
	
	// Create the root object, it needs a configured app (app.rootAutoCollection and app.rootMethods are needed),
	// so it should come after app's property definition
	Object.defineProperty( this , 'root' , { value: this.createObjectNode( appConfig.rootObject ) , enumerable: true } ) ;
	
	// Define shortcut
	Object.defineProperties( this , {
		get: { value: this.root.get.bind( this.root ) , enumerable: true } ,
		post: { value: this.root.post.bind( this.root ) , enumerable: true } ,
		put: { value: this.root.put.bind( this.root ) , enumerable: true } ,
		patch: { value: this.root.patch.bind( this.root ) , enumerable: true } ,
		delete: { value: this.root.delete.bind( this.root ) , enumerable: true } ,
	} ) ;
	
	for ( key in appConfig.collections )
	{
		if ( ! appConfig.collections[ key ].url )
		{
			appConfig.collections[ key ].url = appConfig.defaultDomain + appConfig.collections[ key ].path ;
		}
		
		if ( appConfig.collections[ key ].attachmentPath && ! appConfig.collections[ key ].attachmentUrl )
		{
			appConfig.collections[ key ].attachmentUrl = appConfig.defaultAttachmentDomain + appConfig.collections[ key ].attachmentPath ;
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
			case 'scheduledTasks' :
				if ( hasScheduledTasks ) { throw new Error( "[restQuery] .configure(): should not have two collections of the type 'scheduledTasks'" ) ; }
				hasScheduledTasks = true ;
				collections[ key ] = this.createScheduledTasksCollectionNode( appConfig.collections[ key ] ) ;
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



var logSchema = {
	default: {
		minLevel: 'info' ,
		transports: [
			{ type: "console" , color: true }
		]
	} ,
	properties: {
		transports: {
			default: [
				{ type: "console" , color: true }
			]
		}
	}
} ;

tree.extend( { deep: true } , logSchema , Logfella.configSchema ) ;



var restQueryHookSchema = {
	type: 'function' ,
	optional: true
} ;

App.configSchema = {
	type: 'strictObject' ,
	extraProperties: true ,
	properties: {
		data: {			// contains user-land data
			type: 'strictObject' ,
			default: {}
		} ,
		usr: {		// contains user-land helpers, global objects, etc...
			type: 'strictObject' ,
			default: {}
		} ,
		buildIndexes: { type: 'boolean' , default: false } ,
		port: { type: 'integer' , sanitize: 'toNumber' , default: 8080 } ,
		host: { type: 'host' , default: 'localhost' } ,
		protocol: { type: 'string' , default: 'http' , in: [ 'http' , 'https' , 'ws' , 'wss' ] } ,
		tokenDuration: { type: 'integer' , default: 900000 } ,
		log: logSchema ,
		hooks: {
			type: 'strictObject' ,
			default: {} ,
			extraProperties: true ,
			properties: {
				init: restQueryHookSchema ,
			}
		} ,
		workers: {
			type: 'strictObject' ,
			of: { type: 'function' } ,
			default: {}
		} ,
		scheduler: {
			type: 'strictObject' ,
			default: {
				active: false ,
				tasks: [] ,
				period: 10000
			} ,
			properties: {
				active: {
					type: 'boolean' ,
					default: false
				} ,
				tasks: {
					type: 'array' ,
					default: []
				} ,
				period: {
					type: 'number' ,
					default: 10000
				}
			}
		} ,
		rootAutoCollection: { type: 'string' , default: null } ,
		rootMethods: {
			type: 'strictObject' ,
			of: { type: 'function' } ,
			default: {}
		} ,
		rootObject: {
			type: 'strictObject' ,
			default: {
				userAccess: {} ,
				groupAccess: {} ,
				publicAccess: restQuery.accessSchema.default
			} ,
			extraProperties: true ,
			properties: {
				userAccess: {
					type: 'strictObject' ,
					default: {} ,
					keys: { type: 'objectId' } ,
					of: restQuery.accessSchema
				} ,
				groupAccess: {
					type: 'strictObject' ,
					default: {} ,
					keys: { type: 'objectId' } ,
					of: restQuery.accessSchema
				} ,
				publicAccess: restQuery.accessSchema
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
	var self = this , hookContext ;
	
	if ( ! this.preInitStage )
	{
		// Install logfella exit handlers
		//log.installExitHandlers() ;
		this.installExitHandlers() ;
		this.preInitStage = true ;
	}
	
	if ( this.buildIndexesAtStartup )
	{
		this.buildIndexesAtStartup = false ;
		log.info( 'Building indexes...' ) ;
		
		this.buildIndexes( function( error ) {
			//if ( error ) {}	// What should be done here?
			log.info( "Indexes rebuilt!" ) ;
			self.run() ;	// run again
		} ) ;
		
		return ;
	}
	
	if ( this.initHook && ! this.initHookDone )
	{
		hookContext = {} ;
		
		this.initHook( hookContext , function( error ) {
			
			if ( error )
			{
				log.fatal( 'Init hook error: %E' , error ) ;
				async.exit( 1 ) ;
				return ;
			}
			
			self.initHookDone = true ;
			self.run() ;
		} ) ;
		
		return ;
	}
	
	// Create the server
	restQuery.httpModule.createServer.call( this ) ;
	
	// Start the scheduler
	if ( this.scheduler ) { this.scheduler.run() ; }
} ;



App.prototype.shutdown = function shutdown()
{
	// Close the server
	restQuery.httpModule.closeServer.call( this ) ;
} ;



App.prototype.buildIndexes = function buildIndexes( callback )
{
	async.foreach( this.world.collections , function( collection , name , foreachCallback ) {
		log.verbose( "Checking indexes for collection '%s'" , name ) ;
		collection.buildIndexes( foreachCallback ) ;
	} )
	.exec( callback ) ;
} ;



App.prototype.installExitHandlers = function installExitHandlers()
{
	process.on( 'asyncExit' , function( code , timeout , logCallback ) {
		log.info( 'Asynchronous exit event: the process is about to exit within %ims with code %i...' , timeout , code , logCallback ) ;
	} ) ;
	
	process.on( 'exit' , function( code ) {
		log.info( 'Exit event: the process is exiting with code %i...' , code ) ;
	} ) ;
	
	process.on( 'uncaughtException' , function( error ) {
		var logCallback = noop ;
		var done = false ;
		
		log.fatal( 'Uncaught exception: %E' , error , function() { done = true ; logCallback() ; } ) ;
		
		process.on( 'asyncExit' , function( code , timeout , asyncExitCallback ) {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;
		
		async.exit( 1 ) ;
	} ) ;
	
	process.on( 'SIGINT' , function( error ) {
		var logCallback = noop ;
		var done = false ;
		
		log.info( 'Received a SIGINT signal.' , function() { done = true ; logCallback() ; } ) ;
		
		process.on( 'asyncExit' , function( code , timeout , asyncExitCallback ) {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;
		
		async.exit( 130 ) ;
	} ) ;
	
	process.on( 'SIGTERM' , function( error ) {
		var logCallback = noop ;
		var done = false ;
		
		log.info( 'Received a SIGTERM signal.' , function() { done = true ; logCallback() ; } ) ;
		
		process.on( 'asyncExit' , function( code , timeout , asyncExitCallback ) {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;
		
		async.exit( 143 ) ;
	} ) ;
	
	process.on( 'SIGHUP' , function( error ) {
		var logCallback = noop ;
		var done = false ;
		
		log.info( 'Received a SIGHUP signal.' , function() { done = true ; logCallback() ; } ) ;
		
		process.on( 'asyncExit' , function( code , timeout , asyncExitCallback ) {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;
		
		async.exit( 129 ) ;
	} ) ;
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

App.prototype.createScheduledTasksCollectionNode = function createScheduledTasksCollectionNode( descriptor , collectionNode )
{
	return restQuery.ScheduledTasksCollectionNode.create( this , descriptor , collectionNode ) ;
} ;

// Here, we create a root node
App.prototype.createObjectNode = function createObjectNode( object , ancestors , objectNode )
{
	return restQuery.ObjectNode.create( this , undefined , object , ancestors , objectNode ) ;
} ;

App.prototype.createPerformer = function createPerformer( auth , system )
{
	return restQuery.Performer.create( this , auth , system ) ;
} ;



