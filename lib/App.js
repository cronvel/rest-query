/*
	Rest Query

	Copyright (c) 2014 - 2018 Cédric Ronvel

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



const Promise = require( 'seventh' ) ;

const kungFig = require( 'kung-fig' ) ;
const doormen = require( 'doormen' ) ;
const tree = require( 'tree-kit' ) ;
const rootsDb = require( 'roots-db' ) ;

const Logfella = require( 'logfella' ) ;
const log = Logfella.global.use( 'rest-query' ) ;

const restQuery = require( './restQuery.js' ) ;

function noop() {}



/* App (Root Node) */



function App( appConfigPath , override = null ) {
	this.world = rootsDb.World.create() ;
	this.collectionNodes = {} ;
	this.httpOptions = {} ;

	this.config = null ;
	this.data = null ;	// contains user-land data
	this.usr = null ;	// contains user-land helpers, global objects, etc...

	this.buildIndexesAtStartup = false ;
	this.initDbAtStartup = false ;

	this.serverProtocol = 'http' ;
	this.serverHost = 'localhost' ;
	this.serverPort = 8080 ;
	this.serverAbsoluteUrl = null ;	// done in .configure()

	this.tokenDuration = 900000 ;

	this.rootAutoCollection = null ;
	this.rootMethods = null ;
	this.root = null ;

	this.initHook = null ;
	this.workers = null ;
	this.scheduler = null ;

	// Configure the app NOW!
	this.configure( appConfigPath , override ) ;

	// Define shorthands to root methods (should be done after .configure())
	this.get = this.root.get.bind( this.root ) ;
	this.post = this.root.post.bind( this.root ) ;
	this.put = this.root.put.bind( this.root ) ;
	this.patch = this.root.patch.bind( this.root ) ;
	this.delete = this.root.delete.bind( this.root ) ;
}

module.exports = App ;
App.prototype.constructor = App ;



App.prototype.configure = function( appConfigPath , override = null ) {
	var collections = {} ,
		hasUsers = false , hasGroups = false , hasScheduledTasks = false ;

	// Load the whole config using Kung-Fig
	var appConfig = kungFig.load( appConfigPath ) ;

	if ( override && typeof override === 'object' ) {
		//tree.extend( { deep: true , own: true } , appConfig , override ) ;
		kungFig.autoReduce( appConfig , override ) ;
	}

	// Fix the config
	this.checkAndFixConfig( appConfig ) ;


	// Now we have a clean config! Let's process it!

	this.config = appConfig ;
	this.data = appConfig.data ;
	this.usr = appConfig.usr ;
	this.buildIndexesAtStartup = appConfig.buildIndexes ;
	this.initDbAtStartup = appConfig.initDb ;
	this.serverProtocol = appConfig.protocol ;
	this.serverHost = appConfig.host ;
	this.serverPort = appConfig.port ;
	this.serverAbsoluteUrl = appConfig.protocol + '://' + appConfig.host + ( appConfig.port === 80 ? '' : ':' + appConfig.port ) ;
	this.tokenDuration = appConfig.tokenDuration ;
	this.rootAutoCollection = appConfig.rootAutoCollection ;
	this.rootMethods = appConfig.rootMethods ;

	this.initHook = appConfig.hooks.init && appConfig.hooks.init.bind( this ) ;
	this.workers = appConfig.workers ;
	this.scheduler = appConfig.scheduler.active ? new restQuery.Scheduler( this , appConfig.scheduler ) : null ;

	// Configure Logfella NOW!
	Logfella.global.setGlobalConfig( appConfig.log ) ;

	// Init monitoring
	tree.extend( null , Logfella.global.mon , {
		requests: 0
	} ) ;


	// Create the root object, it needs a configured app (app.rootAutoCollection and app.rootMethods are needed),
	// so it should come after app's property definition
	this.root = this.createObjectNode( appConfig.rootObject ) ;


	Object.keys( appConfig.collections ).forEach( key => {
		if ( ! appConfig.collections[ key ].url ) {
			appConfig.collections[ key ].url = appConfig.defaultDomain + appConfig.collections[ key ].path ;
		}

		if ( appConfig.collections[ key ].attachmentPath && ! appConfig.collections[ key ].attachmentUrl ) {
			appConfig.collections[ key ].attachmentUrl = appConfig.defaultAttachmentDomain + appConfig.collections[ key ].attachmentPath ;
		}

		switch ( appConfig.collections[ key ].restQueryType ) {
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
	} ) ;

	var computeContains = ( parent , subtree ) => {
		var key ;

		for ( key in subtree ) {
			parent.contains( collections[ key ] ) ;

			if ( subtree[ key ] && typeof subtree[ key ] === 'object' ) {
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
		initDb: { type: 'string' , optional: true } ,
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
				init: restQueryHookSchema
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
App.prototype.checkAndFixConfig = function( config ) {
	doormen( App.configSchema , config ) ;
} ;



// Set up the behaviour for CORS, argument can be a string or a function( OriginHeader ) that return a CORS path.
// Note that you don't have to give the full header, only the path.
// E.g.: '*' -> 'Access-Control-Allow-Origin: "*"'
App.prototype.setAllowOrigin = function( rule ) {
	this.httpOptions.allowOrigin = rule ;
} ;



App.prototype.run = async function() {
	var hookContext , config ,
		promise = Promise.resolved ;

	this.installExitHandlers() ;

	if ( this.buildIndexesAtStartup ) {
		log.info( 'Building indexes...' ) ;
		await this.buildIndexes() ;
	}

	if ( this.initDbAtStartup ) {
		config = kungFig.load( this.initDbAtStartup ) ;
		log.info( 'Init the DB...' ) ;

		await this.initDb( config ) ;
		log.info( "DB initialized!" ) ;
	}

	if ( this.initHook ) {
		hookContext = {} ;

		try {
			await this.initHook( hookContext ) ;
		}
		catch ( error ) {
			log.fatal( 'Init hook error: %E' , error ) ;
			Promise.asyncExit( 1 ) ;
			return ;
		}
	}

	// Create the server
	restQuery.httpModule.createServer.call( this ) ;
	
	// Start the scheduler
	if ( this.scheduler ) { this.scheduler.run() ; }
} ;



App.prototype.shutdown = function() {
	// Close the server
	restQuery.httpModule.closeServer.call( this ) ;
} ;



App.prototype.buildIndexes = function() {
	return Promise.mapObject( this.world.collections , ( collection , collectionName ) => {
		log.verbose( "Checking indexes for collection '%s'" , collectionName ) ;
		//return collection.buildIndexes() ;
		return collection.buildIndexes().then(
			() => null ,
			error => { log.verbose( "Failed for collection '%s'" , collectionName ) ; throw error ; }
		) ;
	} ) ;
} ;



App.prototype.initDb = function( collectionTree ) {
	var collection ;

	return Promise.forEach( collectionTree , ( collectionDocuments , collectionName ) => {
		collection = this.world.collections[ collectionName ] ;

		return Promise.forEach( collectionDocuments , rawDocument => {
			document = collection.createDocument( rawDocument ) ;
			log.info( "Creating document: %J" , document ) ;
			return document.save() ;
		} )
	} )
} ;



App.prototype.installExitHandlers = function() {
	process.on( 'asyncExit' , ( code , timeout , logCallback ) => {
		log.info( 'Asynchronous exit event: the process is about to exit within %ims with code %i...' , timeout , code , logCallback ) ;
	} ) ;

	process.on( 'exit' , ( code ) => {
		log.info( 'Exit event: the process is exiting with code %i...' , code ) ;
	} ) ;

	process.on( 'uncaughtException' , ( error ) => {
		var logCallback = noop ;
		var done = false ;

		log.fatal( 'Uncaught exception: %E' , error , () => { done = true ; logCallback() ; } ) ;

		process.on( 'asyncExit' , ( code , timeout , asyncExitCallback ) => {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;

		Promise.asyncExit( 1 ) ;
	} ) ;

	process.on( 'SIGINT' , ( error ) => {
		var logCallback = noop ;
		var done = false ;

		log.info( 'Received a SIGINT signal.' , () => { done = true ; logCallback() ; } ) ;

		process.on( 'asyncExit' , ( code , timeout , asyncExitCallback ) => {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;

		Promise.asyncExit( 130 ) ;
	} ) ;

	process.on( 'SIGTERM' , ( error ) => {
		var logCallback = noop ;
		var done = false ;

		log.info( 'Received a SIGTERM signal.' , () => { done = true ; logCallback() ; } ) ;

		process.on( 'asyncExit' , ( code , timeout , asyncExitCallback ) => {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;

		Promise.asyncExit( 143 ) ;
	} ) ;

	process.on( 'SIGHUP' , ( error ) => {
		var logCallback = noop ;
		var done = false ;

		log.info( 'Received a SIGHUP signal.' , () => { done = true ; logCallback() ; } ) ;

		process.on( 'asyncExit' , ( code , timeout , asyncExitCallback ) => {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;

		Promise.asyncExit( 129 ) ;
	} ) ;
} ;





/* Shorthands */

App.prototype.createNode = function( children ) {
	return new restQuery.Node( this , children ) ;
} ;

App.prototype.createCollectionNode = function( name , descriptor ) {
	return new restQuery.CollectionNode( this , name , descriptor ) ;
} ;

App.prototype.createUsersCollectionNode = function( descriptor ) {
	return new restQuery.UsersCollectionNode( this , descriptor ) ;
} ;

App.prototype.createGroupsCollectionNode = function( descriptor ) {
	return new restQuery.GroupsCollectionNode( this , descriptor ) ;
} ;

App.prototype.createScheduledTasksCollectionNode = function( descriptor ) {
	return new restQuery.ScheduledTasksCollectionNode( this , descriptor ) ;
} ;

// Here, we create a root node
App.prototype.createObjectNode = function( object , ancestors ) {
	return new restQuery.ObjectNode( this , undefined , object , ancestors , null ) ;
} ;

App.prototype.createPerformer = function( auth , system ) {
	return new restQuery.Performer( this , auth , system ) ;
} ;

