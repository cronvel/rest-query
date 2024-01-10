/*
	Rest Query

	Copyright (c) 2014 - 2021 Cédric Ronvel

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

const path = require( 'path' ) ;

const Logfella = require( 'logfella' ) ;
const log = Logfella.global.use( 'rest-query' ) ;

const restQuery = require( './restQuery.js' ) ;

function noop() {}



/* App (Root Node) */



function App( appConfigPath , override = null ) {
	this.world = rootsDb.World.create() ;
	this.collectionNodes = {} ;
	this.allCollectionTags = new Set() ;
	this.allCollectionExecTags = new Set() ;

	this.config = null ;
	this.data = null ;	// contains user-land live data
	this.usr = null ;	// contains user-land helpers, global objects, etc...
	this.usrConfig = null ;	// contains user-land config
	this.scripts = null ;	// contains scripts callable from the command-line
	this.hooks = null ;
	this.schedulerConfig = null ;
	this.scheduler = null ;

	this.jobsCollection = null ;
	this.versionsCollection = null ;

	this.isInit = false ;

	this.buildIndexesAtStartup = false ;
	this.nonBlockingIndexBuilding = false ;
	this.initDbAtStartup = false ;
	this.initDbMode = null ;

	this.httpModule = null ;	// the HTTP server, if any
	this.httpOptions = {} ;
	this.serverProtocol = 'http' ;
	this.serverHost = 'localhost' ;
	this.serverPort = 8080 ;
	this.serverAbsoluteUrl = null ;	// done in .configure()

	this.systemApiKey = null ;
	this.debugGrant = false ;
	this.tokenDuration = 900000 ;

	this.root = null ;

	// Configure the app NOW!
	this.configure( appConfigPath , override ) ;
}

module.exports = App ;
App.prototype.constructor = App ;



App.prototype.configure = function( appConfigPath , override = null ) {
	var collections = {} ,
		hasRoot = false , hasUsers = false , hasGroups = false , hasJobs = false ;

	// Load the whole config using Kung-Fig
	var appConfig = kungFig.load( appConfigPath ) ;

	if ( override && typeof override === 'object' ) {
		tree.extend( { deep: true , own: true } , appConfig , override ) ;
	}

	// Fix the config
	this.checkAndFixConfig( appConfig ) ;


	// Now we have a clean config! Let's process it!

	this.config = appConfig ;
	this.data = appConfig.data ;
	this.usr = appConfig.usr ;
	this.usrConfig = appConfig.usrConfig ;
	this.scripts = appConfig.scripts ;
	this.buildIndexesAtStartup = appConfig.buildIndexes ;
	this.nonBlockingIndexBuilding = appConfig.nonBlockingIndexBuilding ;
	this.initDbAtStartup = appConfig.initDb ;
	this.initDbMode = appConfig.initDbMode ;
	this.serverProtocol = appConfig.protocol ;
	this.serverHost = appConfig.host ;
	this.serverPort = appConfig.port ;
	this.serverAbsoluteUrl = appConfig.protocol + '://' + appConfig.host + ( appConfig.port === 80 ? '' : ':' + appConfig.port ) ;
	this.maxBodyDataSize = appConfig.maxBodyDataSize ;

	this.systemApiKey = appConfig.systemApiKey || null ;
	this.debugGrant = !! appConfig.debugGrant ;
	this.tokenDuration = appConfig.tokenDuration ;
	this.queryLimit = appConfig.queryLimit ;

	this.hooks = appConfig.hooks ;
	this.schedulerConfig = appConfig.scheduler ;

	// Configure Logfella NOW!
	Logfella.global.setGlobalConfig( appConfig.log ) ;

	// Init monitoring
	tree.extend( null , Logfella.global.mon , {
		requests: 0
	} ) ;

	// Scheduler, should come before collection with role 'job'
	if ( this.schedulerConfig.active ) {
		// Don't use Object.assign(), multiple call on the constructor (like in unit tests) would cause errors
		let jobsDescriptor = tree.extend( { deep: true } , {} , restQuery.Scheduler.Job.descriptor , this.schedulerConfig.jobs ) ;
		if ( ! jobsDescriptor.url ) {
			if ( ! appConfig.defaultDomain ) { throw new Error( "App's config is missing 'defaultDomain' but the 'jobs' collection has a 'path' instead of a full URL" ) ; }
			jobsDescriptor.url = appConfig.defaultDomain + jobsDescriptor.path ;
		}
		if ( ! jobsDescriptor.collectionName ) { jobsDescriptor.collectionName = 'jobs' ; }
		this.jobsCollection = this.createJobsCollection( jobsDescriptor ) ;
	}


	Object.keys( appConfig.collections ).forEach( key => {
		if ( ! appConfig.collections[ key ].url ) {
			if ( ! appConfig.defaultDomain ) { throw new Error( "App's config is missing 'defaultDomain' but collection '" + key + "' has a 'path' instead of a full URL" ) ; }
			appConfig.collections[ key ].url = appConfig.defaultDomain + appConfig.collections[ key ].path ;
		}

		if ( appConfig.collections[ key ].attachmentPath && ! appConfig.collections[ key ].attachmentUrl ) {
			if ( ! appConfig.defaultAttachmentDomain ) { throw new Error( "App's config is missing 'defaultAttachmentDomain' but collection '" + key + "' has an 'attachmentPath' instead of a full URL" ) ; }
			appConfig.collections[ key ].attachmentUrl = appConfig.defaultAttachmentDomain + appConfig.collections[ key ].attachmentPath ;
		}

		if ( appConfig.collections[ key ].attachmentPublicBasePath && ! appConfig.collections[ key ].attachmentPublicBaseUrl ) {
			if ( ! appConfig.defaultAttachmentPublicDomain ) { throw new Error( "App's config is missing 'defaultAttachmentPublicDomain' but collection '" + key + "' has an 'attachmentPublicBasePath' instead of a full URL" ) ; }
			appConfig.collections[ key ].attachmentPublicBaseUrl = appConfig.defaultAttachmentPublicDomain + appConfig.collections[ key ].attachmentPublicBasePath ;
		}

		switch ( appConfig.collections[ key ].role ) {
			case 'root' :
				if ( hasRoot ) { throw new Error( "[restQuery] .configure(): should not have two collections having the 'root' role" ) ; }
				hasRoot = true ;
				collections[ key ] = this.createRootCollectionNode( appConfig.collections[ key ] ) ;
				break ;
			case 'user' :
				if ( hasUsers ) { throw new Error( "[restQuery] .configure(): should not have two collections having the 'user' role" ) ; }
				hasUsers = true ;
				collections[ key ] = this.createUsersCollectionNode( appConfig.collections[ key ] ) ;
				break ;
			case 'group' :
				if ( hasGroups ) { throw new Error( "[restQuery] .configure(): should not have two collections having the 'group' role" ) ; }
				hasGroups = true ;
				collections[ key ] = this.createGroupsCollectionNode( appConfig.collections[ key ] ) ;
				break ;
			case 'job' :
				if ( this.jobsCollection ) {
					if ( hasJobs ) { throw new Error( "[restQuery] .configure(): should not have two collections having the 'job' role" ) ; }
					hasJobs = true ;
					throw new Error( "Not supported ATM" ) ;
				}
				break ;
			default :
				collections[ key ] = this.createCollectionNode( key , appConfig.collections[ key ] ) ;
				break ;
		}
	} ) ;


	// Versioning
	if ( appConfig.versioning.active ) {
		appConfig.versioning.collectionName = 'versions' ;
		if ( ! appConfig.versioning.url ) {
			if ( ! appConfig.defaultDomain ) { throw new Error( "App's config is missing 'defaultDomain' but versioning collection has a 'path' instead of a full URL" ) ; }
			appConfig.versioning.url = appConfig.defaultDomain + appConfig.versioning.path ;
		}
		this.versionsCollection = this.createVersionsCollection( appConfig.versioning ) ;
	}


	var computeContains = ( parent , subtree ) => {
		var key ;

		for ( key in subtree ) {
			if ( ! collections[ key ] ) {
				log.fatal( "Error in the App Tree, collection '%s' does not exist. Tree:\n%I" , key , appConfig.tree ) ;
				throw new Error( "Error in the App Tree, collection '" + key + "' does not exist." ) ;
			}

			parent.contains( collections[ key ] ) ;

			if ( subtree[ key ] && typeof subtree[ key ] === 'object' ) {
				computeContains( collections[ key ] , subtree[ key ] ) ;
			}
		}
	} ;

	computeContains( collections.root , appConfig.tree ) ;

	// HTTP
	this.setAllowOrigin( appConfig.http.allowOrigin ) ;
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



App.configSchema = {
	type: 'strictObject' ,
	extraProperties: true ,
	properties: {
		data: {			// contains user-land live data
			type: 'strictObject' ,
			default: {}
		} ,
		usr: {		// contains user-land helpers, global objects, etc...
			type: 'strictObject' ,
			default: {}
		} ,
		usrConfig: {			// contains user-land config
			type: 'strictObject' ,
			default: {}
		} ,
		scripts: {		// contains scripts callable from the CLI
			type: 'strictObject' ,
			default: {}
		} ,
		buildIndexes: { type: 'boolean' , default: false } ,
		nonBlockingIndexBuilding: { type: 'boolean' , default: false } ,
		initDb: { type: 'string' , optional: true } ,
		initDbMode: { type: 'string' , optional: true , in: [ 'create' , 'overwrite' ] } ,
		port: { type: 'integer' , sanitize: 'toInteger' , default: 8080 } ,
		host: { type: 'host' , default: 'localhost' } ,
		protocol: { type: 'string' , default: 'http' , in: [ 'http' , 'https' , 'ws' , 'wss' ] } ,
		maxBodyDataSize: { type: 'integer' , sanitize: 'toInteger' , default: 10000 } ,
		systemApiKey: { type: 'string' , default: '' } ,
		debugGrant: { type: 'boolean' , sanitize: 'toBoolean' , default: false } ,
		tokenDuration: { type: 'integer' , sanitize: 'toInteger' , default: 900000 } ,
		queryLimit: { type: 'number' , default: null } ,

		http: {		// contains scripts callable from the CLI
			type: 'strictObject' ,
			default: { allowOrigin: '*' } ,
			properties: {
				allowOrigin: {
					type: 'string' ,	// Also it can be a function, but for instance we will keep it a string
					default: '*'
				}
			}
		} ,

		// Global default public access, i.e. default² public access, i.e. default public access for all collections that does not define their own default public access
		defaultPublicAccess: tree.extend( { deep: true } , {} , restQuery.accessSchema , { optional: true } ) ,

		log: logSchema ,
		hooks: {
			type: 'strictObject' ,
			default: {} ,
			of: restQuery.hooks.schema
		} ,
		versioning: {
			type: 'strictObject' ,
			default: {
				active: false
			} ,
			extraProperties: true ,
			properties: {
				active: {
					type: 'boolean' ,
					default: false
				}
			} ,
			constraints: [ {
				enforce: 'condition' ,
				if: {
					extraProperties: true ,
					properties: {
						active: { eq: true }
					}
				} ,
				then: {
					extraProperties: true ,
					properties: {
						path: {
							type: 'string'
						}
					}
				}
			} ]
		} ,
		scheduler: {
			type: 'strictObject' ,
			default: { active: false } ,
			extraProperties: true ,
			properties: {
				active: { type: 'boolean' } ,
				concurrency: { type: 'integer' , default: Infinity } ,
				retrieveDelay: { type: 'number' , default: 60 * 1000 } ,
				retryDelay: { type: 'number' , default: 60 * 1000 } ,
				retryDelayExpBase: { type: 'number' , default: 1 } ,
				maxRetry: { type: 'integer' , default: 0 } ,
				jobs: {
					type: 'strictObject' ,
					default: {} ,
					extraProperties: true
				} ,
				domains: {
					type: 'strictObject' ,
					default: {} ,
					extraProperties: true ,
					of: {
						type: 'strictObject' ,
						properties: {
							concurrency: { type: 'integer' , optional: true } ,
							retrieveDelay: { type: 'number' , optional: true } ,
							retryDelay: { type: 'number' , optional: true } ,
							retryDelayExpBase: { type: 'number' , optional: true } ,
							maxRetry: { type: 'integer' , optional: true } ,
							runners: {
								type: 'strictObject' ,
								of: { type: 'function' } ,
								default: {}
							}
						}
					}
				} ,
				// Runners on default domain
				runners: {
					type: 'strictObject' ,
					of: { type: 'function' } ,
					default: {}
				}
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



App.prototype.init = async function() {
	if ( this.isInit ) { return ; }

	await Promise.mapObject( this.collectionNodes , collectionNode => collectionNode.init() ) ;

	if ( this.schedulerConfig.active ) {
		let config = Object.assign( {} , this.schedulerConfig , {
			world: this.world ,
			jobs: this.jobsCollection ,
			extraRunnerArgs: [ this ]
		} ) ;
		this.scheduler = new restQuery.Scheduler( config ) ;
	}

	this.isInit = true ;
} ;



App.prototype.run = async function() {
	this.installExitHandlers() ;

	// First, init
	try {
		await this.init() ;
	}
	catch ( error ) {
		log.fatal( 'Init error: %E' , error ) ;
		Promise.asyncExit( 1 ) ;
		return ;
	}

	if ( this.buildIndexesAtStartup ) {
		if ( this.nonBlockingIndexBuilding ) {
			this.buildIndexes().catch ( error => {
				log.error( 'Build indexes error: %E' , error ) ;
			} ) ;
		}
		else {
			try {
				await this.buildIndexes() ;
			}
			catch ( error ) {
				log.fatal( 'Build indexes error: %E' , error ) ;
				Promise.asyncExit( 1 ) ;
				return ;
			}
		}
	}

	if ( this.initDbAtStartup ) {
		try {
			await this.initDb( this.initDbAtStartup , this.initDbMode ) ;
		}
		catch ( error ) {
			log.fatal( 'Init DB error: %E' , error ) ;
			Promise.asyncExit( 1 ) ;
			return ;
		}
	}

	try {
		await this.loadSystemDocuments() ;
	}
	catch ( error ) {
		log.fatal( 'Load System documents failed: %E' , error ) ;
		Promise.asyncExit( 1 ) ;
		return ;
	}

	if ( this.hooks.init ) {
		try {
			await restQuery.hooks.run( this.hooks.init , { app: this } ) ;
		}
		catch ( error ) {
			log.fatal( 'Init hook error: %E' , error ) ;
			Promise.asyncExit( 1 ) ;
			return ;
		}
	}

	if ( this.debugGrant ) {
		log.warning( "CAUTION: 'DEBUG GRANT' IS TURNED ON! NOT SUITABLE FOR PRODUCTION!!!" ) ;
	}

	// Create the server
	this.httpModule = new restQuery.HttpModule( this , {
		serverPort: this.serverPort ,
		httpOptions: this.httpOptions ,
		serverAbsoluteUrl: this.serverAbsoluteUrl ,
		maxBodyDataSize: this.maxBodyDataSize
	} ) ;

	// Start the web server
	this.httpModule.createServer() ;

	// Start the scheduler
	if ( this.schedulerConfig.active ) { this.scheduler.start() ; }

	// Check if there is an IPC channel, to send a ready message
	// /!\ Later, we could use nextgen-events proxy for transmitting true events
	if ( process.send ) {
		log.info( "IPC ready sent" ) ;
		process.send( { event: 'ready' } ) ;
	}
} ;



App.prototype.shutdown = async function() {
	if ( this.hooks.shutdown ) {
		try {
			await restQuery.hooks.run( this.hooks.shutdown , { app: this } ) ;
		}
		catch ( error ) {
			log.fatal( 'Shutdown hook error: %E' , error ) ;
		}
	}

	// Close the server
	if ( this.httpModule ) {
		this.httpModule.closeServer() ;
	}
} ;



App.prototype.buildIndexes = function() {
	log.info( 'Building indexes...' ) ;
	return Promise.mapObject( this.world.collections , ( collection , collectionName ) => {
		log.info( "Checking indexes for collection '%s'" , collectionName ) ;
		//return collection.buildIndexes() ;
		return collection.buildIndexes().then(
			() => { log.info( "Indexes ensured for collection '%s'" , collectionName ) ; } ,
			error => { log.error( "Build indexes failed for collection '%s': %E" , collectionName , error ) ; throw error ; }
		) ;
	} ).then(
		() => log.info( 'Indexes built' )
	) ;
} ;



App.prototype.initDb = function( filePath , mode ) {
	log.info( 'Initing the DB...' ) ;
	var collectionTree = kungFig.load( filePath ) ;

	return Promise.forEach( Object.keys( collectionTree ) , async ( collectionName ) => {
		var collectionDocuments = collectionTree[ collectionName ] ;
		var collection = this.world.collections[ collectionName ] ;

		if ( collectionName === 'root' && collectionDocuments.length && mode === 'overwrite' ) {
			log.info( "Removing the root document" ) ;

			// /!\ /!\ /!\ TMP hack, raw driver should be init before-hand /!\ /!\ /!\
			await collection.driver.rawInit() ;

			await collection.driver.raw.deleteMany( {} ) ;
		}

		return Promise.forEach( collectionDocuments , rawDocument => {
			var document = collection.createDocument( rawDocument ) ;
			log.info( "Creating document: %J" , document ) ;
			return document.save( { overwrite: mode === 'overwrite' } ).catch( error => {
				log.error( "Failed to save the document: %E" , error ) ;
			} ) ;
		} ) ;
	} ).then(
		() => log.info( "DB initialized!" )
	) ;
} ;



App.prototype.import = async function( mappingFilePath , mode , concurrency , stats ) {
	log.info( "Importing data... (concurrency: %i)" , concurrency ) ;

	var mapping = null ,
		mappingFileExt = path.extname( mappingFilePath ).slice( 1 ) ,
		baseDir = path.dirname( mappingFilePath ) ;

	switch ( mappingFileExt ) {
		case 'json' :
		case 'js' :
			mapping = require( mappingFilePath ) ;
			break ;
		case 'kfg' :
			mapping = kungFig.load( mappingFilePath ) ;
			break ;
	}

	await this.world.import(
		mapping ,
		{
			baseDir ,
			concurrency ,
			clearCollections: mode === 'clearCollections' ,
			initDocument: ( rawDocument , collectionName ) => {
				var collectionNode = this.collectionNodes[ collectionName ] ;
				if ( ! collectionNode ) { return ; }
				//log.hdebug( "Init document before: %I" , rawDocument ) ;
				collectionNode.initDocument( rawDocument ) ;
				//log.hdebug( "Init document after: %I" , rawDocument ) ;
			} ,
			duplicateKeyRetries: 5 ,
			onDuplicateKey: ( collection , document , error ) => {
				var collectionNode = this.collectionNodes[ collection.name ] ;

				if ( restQuery.CollectionNode.areSlugIndexProperties( error.indexProperties ) ) {
					collectionNode.retryGenerateSlug( document ) ;
					return true ;
				}

				if ( restQuery.CollectionNode.areHidIndexProperties( error.indexProperties ) ) {
					collectionNode.retryGenerateHid( document ) ;
					return true ;
				}

				return false ;
			}
		} ,
		stats
	) ;

	log.info( "DB imported!" ) ;
} ;



App.prototype.loadSystemDocuments = async function() {
	var rootObject ;

	try {
		rootObject = await this.collectionNodes.root.collection.getUnique( { name: '/' } ) ;
	}
	catch ( error ) {
		if ( error.type !== 'notFound' ) {
			log.error( "Error: %E" , error ) ;
			throw error ;
		}

		log.info( "Creating a default root object" ) ;
		rootObject = this.collectionNodes.root.collection.createDocument( { name: '/' } ) ;
		await rootObject.save() ;
	}

	this.root = this.createObjectNode( rootObject ) ;

	/*
	// Test... but this require a replica sets...
	await this.collectionNodes.root.collection.driver.rawInit() ;
	var changeStream = this.collectionNodes.root.collection.driver.raw.watch( { fullDocument: 'updateLookup' } ) ;
	changeStream.on('change', next => {
		log.hdebug( "Change: %I" , next ) ;
	} ) ;
	*/
} ;



App.prototype.installExitHandlers = function() {
	process.on( 'asyncExit' , ( code , timeout , logCallback ) => {
		log.info( 'Asynchronous exit event: the process is about to exit within %ims with code %i...' , timeout , code )
			.then( () => this.shutdown() )
			.then( () => { logCallback() ; } ) ;
	} ) ;

	process.on( 'exit' , ( code ) => {
		log.info( 'Exit event: the process is exiting with code %i...' , code ) ;
	} ) ;

	process.on( 'uncaughtException' , ( error ) => {
		var logCallback = noop ;
		var done = false ;

		log.fatal( 'Uncaught exception: %E' , error ).then( () => { done = true ; logCallback() ; } ) ;

		process.on( 'asyncExit' , ( code , timeout , asyncExitCallback ) => {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;

		Promise.asyncExit( 1 ) ;
	} ) ;

	process.on( 'unhandledRejection' , error => {
		log.fatal( 'Unhandled promise rejection: %E\n^rUnhandled rejection are ^R^+DEPRECATED^:^r and will end the Node.js process in the future!' , error ) ;
	} ) ;

	process.on( 'SIGINT' , ( error ) => {
		var logCallback = noop ;
		var done = false ;

		log.info( 'Received a SIGINT signal.' ).then( () => { done = true ; logCallback() ; } ) ;

		process.on( 'asyncExit' , ( code , timeout , asyncExitCallback ) => {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;

		Promise.asyncExit( 130 ) ;
	} ) ;

	process.on( 'SIGTERM' , ( error ) => {
		var logCallback = noop ;
		var done = false ;

		log.info( 'Received a SIGTERM signal.' ).then( () => { done = true ; logCallback() ; } ) ;

		process.on( 'asyncExit' , ( code , timeout , asyncExitCallback ) => {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;

		Promise.asyncExit( 143 ) ;
	} ) ;

	process.on( 'SIGHUP' , ( error ) => {
		var logCallback = noop ;
		var done = false ;

		log.info( 'Received a SIGHUP signal.' ).then( () => { done = true ; logCallback() ; } ) ;

		process.on( 'asyncExit' , ( code , timeout , asyncExitCallback ) => {
			if ( done ) { asyncExitCallback() ; }
			else { logCallback = asyncExitCallback ; }
		} ) ;

		Promise.asyncExit( 129 ) ;
	} ) ;
} ;



// Top-level requests
App.prototype.get = async function( ... args ) {
	await this.root.object.refresh() ;
	return this.root.get( ... args ) ;
} ;

App.prototype.post = async function( ... args ) {
	await this.root.object.refresh() ;
	return this.root.post( ... args ) ;
} ;

App.prototype.put = async function( ... args ) {
	await this.root.object.refresh() ;
	return this.root.put( ... args ) ;
} ;

App.prototype.patch = async function( ... args ) {
	await this.root.object.refresh() ;
	return this.root.patch( ... args ) ;
} ;

App.prototype.delete = async function( ... args ) {
	await this.root.object.refresh() ;
	return this.root.delete( ... args ) ;
} ;



App.prototype.createNode = function( children ) {
	return new restQuery.Node( this , children ) ;
} ;

App.prototype.createCollectionNode = function( name , descriptor ) {
	return new restQuery.CollectionNode( this , name , descriptor ) ;
} ;

App.prototype.createRootCollectionNode = function( descriptor ) {
	return new restQuery.RootCollectionNode( this , descriptor ) ;
} ;

App.prototype.createUsersCollectionNode = function( descriptor ) {
	return new restQuery.UsersCollectionNode( this , descriptor ) ;
} ;

App.prototype.createGroupsCollectionNode = function( descriptor ) {
	return new restQuery.GroupsCollectionNode( this , descriptor ) ;
} ;

// Here, we create a root node
App.prototype.createObjectNode = function( object , ancestors ) {
	return new restQuery.ObjectNode( this , this.collectionNodes.root , object , ancestors , null ) ;
} ;

App.prototype.createPerformer = function( auth , system ) {
	return new restQuery.Performer( this , auth , system ) ;
} ;

App.prototype.createVersionsCollection = function( descriptor ) {
	return this.world.createVersionCollection( descriptor.collectionName , descriptor ) ;
} ;

App.prototype.createJobsCollection = function( descriptor ) {
	return this.world.createCollection( descriptor.collectionName , descriptor ) ;
	//return new restQuery.JobsCollectionNode( this , descriptor ) ;
} ;

