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



const fs = require( 'fs' ) ;
const path = require( 'path' ) ;

const tree = require( 'tree-kit' ) ;

const Promise = require( 'seventh' ) ;

//const string = require( 'string-kit' ) ;
const cliManager = require( 'utterminal' ).cli ;
const restQuery = require( './restQuery.js' ) ;

const commands = {} ;



module.exports = function( appMeta ) {
	/* eslint-disable indent */
	cliManager.app( appMeta || {
			package: require( '../package.json' ) ,
			name: 'Rest Query' ,
			description: "Rest Query is the runtime for the awesome REST framework."
		} )
		.usage( "[--parameter1 value1] [--parameter2 value2] [...]" )
		.introIfTTY
		.helpOption
		// Don't add .commonOptions, it interferes with restquery's log config which is an object
		.camel
		.commonCommands
		.commandRequired
		.opt( 'config' ).string
			.description( "The path of the main application config file (.kfg)" )
		.opt( 'mod' ).string
			.description( "The file name of an override config file (.kfg), located in the 'mods' directory" )
		.command( [ 'server' , 'start' ] )
			.description( "Start the Rest Query server application." )
			.opt( 'build-indexes' ).flag
				.description( "Build all collections' indexes." )
			// .opt( 'non-blocking-index' ).flag.description( "Index building is non-blocking." )
			.opt( 'init-db' ).string
				.typeLabel( 'db-path' )
				.description( "The DB file, using .kfg" )
			.opt( 'init-db-overwrite' ).flag
				.description( "Overwrite existing documents" )
			.opt( 'init-db-create' ).flag
				.description( "Create documents if unexistant" )
			.opt( 'debug-grant' ).flag
				.description( "Grant all access to client based on the 'X-Grant' header or 'grant' property in the query string (debug only, DO NOT USE IN PRODUCTION)" )
		.command( 'build-indexes' )
			.description( "Build all collections' indexes." )
		.command( 'init-db' )
			.description( "Init the DB." )
			.arg( 'dbPath' ).string
				.typeLabel( 'db-path' )
				.description( "The DB file, using .kfg" )
			.opt( 'overwrite' ).flag
				.description( "Overwrite existing documents" )
			.opt( 'create' ).flag
				.description( "Create documents if unexistant" )
		.command( 'import' )
			.description( "Import data." )
			.arg( 'mappingFilePath' ).string
				.typeLabel( 'file-path' )
				.description( "The mapping file to import, in .json or .kfg" )
			.opt( 'overwrite' ).flag
				.description( "Overwrite existing documents" )
			.opt( 'create' ).flag
				.description( "Create documents if unexistant" )
			.opt( 'clear-collections' ).flag
				.description( "Clear any collections that will import data" )
			.opt( [ 'concurrency' , 'c' ] ).number
				.description( "Concurrency limit when saving documents to the DB" )
				.default( 10 )
			.opt( 'progress' ).flag
				.description( "Show the importing progress bar" )
		.command( 'clear-collections' )
			.description( "Interactively clear all collections, DELETING ALL DATA." )
		.command( 'exec' )
			.description( "Execute a script." )
			.arg( 'script' ).string.mandatory
				.typeLabel( 'script-name' )
				.description( "The script's name" )
			.restArgs( 'args' )
				.description( "The script's arguments" )
		.command( 'install-extension' )
			.description( "Install an extension." )
			.arg( 'extension-id' ).string.mandatory
				.typeLabel( 'extension-ID' )
				.description( "The extension to install" )
			.arg( 'namespace' ).string
				.typeLabel( 'namespace' )
				.description( "The namespace of the extension (default to the master namespace)" )
			.opt( 'active' ).flag
				.description( "Set this flag if the extension is active (always loaded)" )
		.command( 'list-extensions' )
			.description( "List installed extensions." )
		.command( 'mon' )
			.description( "Monitor an existing Rest Query server." ) ;
	/* eslint-enable indent */

	var args = cliManager.run() ;

	var configPath = args.config ;
	delete args.config ;

	if ( configPath ) {
		try {
			configPath = fs.realpathSync( configPath ) ;
		}
		catch ( error ) {
			console.error( error.message ) ;
			process.exit( 1 ) ;
		}
	}
	else {
		try {
			configPath = path.join( process.cwd() , 'app' , 'main.kfg' ) ;
			configPath = fs.realpathSync( configPath ) ;
		}
		catch ( error ) {
			try {
				configPath = path.join( process.cwd() , 'main.kfg' ) ;
				configPath = fs.realpathSync( configPath ) ;
			}
			catch ( error_ ) {
				console.error( error_.message ) ;
				process.exit( 1 ) ;
			}
		}
	}

	// Init the root path to the configPath directory
	restQuery.initExtensions( path.dirname( configPath ) ) ;

	commands[ args.command ]( configPath , args ) ;
} ;



commands.server = function( configPath , args ) {
	if ( args.initDbCreate ) {
		args.initDbMode = 'create' ;
		delete args.initDbCreate ;
	}

	if ( args.initDbOverwrite ) {
		args.initDbMode = 'overwrite' ;
		delete args.initDbOverwrite ;
	}

	var app = new restQuery.App( configPath , args ) ;
	app.run() ;
} ;



commands['build-indexes'] = async function( configPath , args ) {
	var app = new restQuery.App( configPath , args ) ;
	await app.buildIndexes() ;
	process.exit() ;
} ;



commands['init-db'] = async function( configPath , args ) {
	var mode = null ;

	if ( ! args.dbPath ) {
		cliManager.displayHelp() ;
		process.exit( 1 ) ;
	}

	if ( args.create ) {
		mode = 'create' ;
		delete args.create ;
	}

	if ( args.overwrite ) {
		mode = 'overwrite' ;
		delete args.overwrite ;
	}

	var app = new restQuery.App( configPath , args ) ;
	await app.buildIndexes() ;
	await app.initDb( args.dbPath , mode ) ;
	process.exit() ;
} ;



commands['clear-collections'] = async function( configPath , args ) {
	const term = require( 'terminal-kit' ).terminal ;

	var app = new restQuery.App( configPath , args ) ;
	var collectionNames = Object.keys( app.world.collections ) ;

	term( "\n^Y^+Collections found^:: " ) ;

	var first = true ;
	for ( let name of collectionNames ) {
		if ( first ) { term( "^C^+^/%s^:" , name ) ; }
		else { term( ", ^C^+^/%s" , name ) ; }
		first = false ;
	}

	term( ".\n\n" ) ;

	var response ,
		timeout = 500 ;

	for ( let name of collectionNames ) {
		term( '^YClear collection^ ^C^/%s^:^Y?^ ^+[y|n]^ ' , name ) ;
		response = await term.yesOrNo().promise ;
		term( "\n" ) ;
		if ( ! response ) { continue ; }

		term( "^RThis action is DEFINITIVE , ALL ARE DATA WILL BE LOST!!!^:\n" ) ;
		await Promise.resolveTimeout( timeout ) ;
		term( "^R^+ARE " ) ;
		await Promise.resolveTimeout( timeout ) ;
		term( "^R^+YOU " ) ;
		await Promise.resolveTimeout( timeout ) ;
		term( "^R^+SURE " ) ;
		await Promise.resolveTimeout( timeout ) ;
		term( "^R^+?^ [y|n] " ) ;

		response = await term.yesOrNo().promise ;
		term( "\n" ) ;
		if ( ! response ) { continue ; }

		await app.world.collections[ name ].clear() ;
		term( "^YCollection^ ^C^/%s^ ^Y^+CLEARED^:...\n" , name ) ;
	}

	process.exit() ;
} ;



commands.import = async function( configPath , args ) {
	const term = require( 'terminal-kit' ).terminal ;

	var progressBar , progressBarUpdate , timer ,
		mode = null ,
		importError = null ,
		stats = {} ;

	if ( ! args.mappingFilePath ) {
		cliManager.displayHelp() ;
		process.exit( 1 ) ;
	}

	if ( args.create ) {
		mode = 'create' ;
		delete args.create ;
	}

	if ( args.overwrite ) {
		mode = 'overwrite' ;
		delete args.overwrite ;
	}

	if ( args.clearCollections ) {
		mode = 'clearCollections' ;
		delete args.clearCollections ;
	}

	var app = new restQuery.App( configPath , args ) ;

	if ( args.progress ) {
		let lastStep = undefined ;

		progressBar = term.progressBar( {
			width: 80 ,
			percent: true ,
			eta: true ,
			title: 'Importing data...' ,
			titleSize: 45
		} ) ;

		term.column( 1 ) ;

		progressBarUpdate = () => {
			if ( ! stats.step ) { return ; }

			if ( lastStep !== stats.step ) { progressBar.reset() ; }

			var data = {} ;
			data.title = stats.stepStr ;

			switch ( stats.step ) {
				case 1 :
					data.title += ' [' + stats.retrievedDocuments + ']' ;
					break ;
				case 2 :
					data.title += ' [' + stats.documents + ']' ;
					break ;
				case 3 :
					data.title += ' [' + stats.savedDocuments + '/' + stats.documents + ']' ;
					data.progress = stats.savedDocuments / stats.documents ;
					break ;
				case 4 :
					data.title += ' [' + stats.linkingDocuments + ']' ;
					break ;
				case 5 :
					data.title += ' [' + stats.savedLinkingDocuments + '/' + stats.linkingDocuments + ']' ;
					data.progress = stats.savedLinkingDocuments / stats.linkingDocuments ;
					break ;
			}

			progressBar.update( data ) ;

			if ( data.progress && data.progress >= 1 ) {
				clearInterval( timer ) ;
				progressBar.stop() ;
				term( "\n" ) ;
			}

			lastStep = stats.step ;
		} ;

		timer = setInterval( progressBarUpdate , 1000 ) ;

		process.on( 'exit' , () => term( "\n" ) ) ;
	}

	try {
		await app.import( args.mappingFilePath , mode , args.concurrency , stats ) ;

		if ( progressBar ) {
			clearInterval( timer ) ;
			progressBarUpdate() ;
			progressBar.stop() ;
			term( "\n" ) ;
		}
	}
	catch ( error ) {
		if ( progressBar ) {
			clearInterval( timer ) ;
			progressBarUpdate() ;
			progressBar.stop() ;
			term( "\n" ) ;
		}

		importError = error ;
	}

	importReporting( stats ) ;
	term( "\n" ) ;

	if ( importError ) {
		term.red( "Import error: %E\n" , importError ) ;
		process.exit( 1 ) ;
	}
	else {
		term.green( "Successful Import!\n" ) ;
		process.exit() ;
	}
} ;



function importReporting( stats ) {
	const term = require( 'terminal-kit' ).terminal ;
	//term( "Import stats: %Y" , stats ) ;

	for ( let sourceFile in stats.perSourceFiles ) {
		term( "\n^+^Y=== Source File^ ^M^/%s^ ^+^Y===^:\n\n" , sourceFile ) ;
		importSubReporting( term , stats.perSourceFiles[ sourceFile ] ) ;
	}

	for ( let collectionName in stats.perCollections ) {
		term( "\n^+^Y=== Collection^ ^M^/%s^ ^+^Y===^:\n\n" , collectionName ) ;
		importSubReporting( term , stats.perCollections[ collectionName ] ) ;
	}

	term( "\n^+^Y=== SUMMARY ===^:\n\n" ) ;
	term( "  ^+^WDuration^ -- ^Btotal^:: ^c%[a]t^    ^Bretrieve from DB^:: ^c%[a]t^    ^Bload to memory^:: ^c%[a]t^    ^Bsave to DB^:: ^c%[a]t^    ^Brestore links^:: ^c%[a]t^    ^Bsave links to DB^:: ^c%[a]t^:\n" ,
		stats.duration , stats.retrieveFromDbDuration , stats.importToMemoryDuration , stats.saveToDbDuration , stats.restoreLinksDuration , stats.saveRestoredLinksToDbDuration
	) ;
	term( "  ^+^WMemory (heap)^ -- ^Bstarting^:: ^c%k^    ^Bretrieve from DB^:: ^c%k^    ^Bload to memory^:: ^c%k^    ^Bsave to DB^:: ^c%k^    ^Brestore links^:: ^c%k^    ^Bsave links to DB^:: ^c%k^:\n" ,
		stats.startingHeapMemory , stats.retrieveFromDbMemory , stats.importToMemoryHeapMemory , stats.saveToDbHeapMemory , stats.restoreLinksHeapMemory , stats.saveRestoredLinksToDbHeapMemory
	) ;
	term( "  ^+^WMemory (external)^ -- ^Bstarting^:: ^c%k^    ^Bretrieve from DB^:: ^c%k^    ^Bload to memory^:: ^c%k^    ^Bsave to DB^:: ^c%k^    ^Brestore links^:: ^c%k^    ^Bsave links to DB^:: ^c%k^:\n" ,
		stats.startingExternalMemory , stats.retrieveFromDbMemory , stats.importToMemoryExternalMemory , stats.saveToDbExternalMemory , stats.restoreLinksExternalMemory , stats.saveRestoredLinksToDbExternalMemory
	) ;
	term( "  ^+^WDocuments^ -- ^Btotal^:: ^c%i^    ^Bsaved^:: ^c%i^ (^c%[.1]P^:)    (^Bretrieved^:: ^c%i^:)\n" ,
		stats.documents , stats.savedDocuments , stats.savedDocuments / stats.documents || 0 , stats.retrievedDocuments
	) ;
	term( "  ^+^WEmbedded documents^ -- ^Bembedded^:: ^c%i^    ^Borphans^:: ^c%i^ (^c%[.1]P^:)\n" ,
		stats.embeddedDocuments , stats.orphanEmbeddedDocuments , stats.orphanEmbeddedDocuments / ( stats.embeddedDocuments + stats.orphanEmbeddedDocuments ) || 0
	) ;
	term( "  ^+^WLinks^ -- ^Blinks^:: ^c%i^    ^Borphans^:: ^c%i^ (^c%[.1]P^:)    ^Blinking documents^:: ^c%i^    ^Bsaved^:: ^c%i^ (^c%[.1]P^:)\n" ,
		stats.links , stats.orphanLinks , stats.orphanLinks / ( stats.links + stats.orphanLinks ) || 0 ,
		stats.linkingDocuments , stats.savedLinkingDocuments , stats.savedLinkingDocuments / stats.linkingDocuments || 0
	) ;
	term( "  ^+^WFiltered documents^ -- ^Bfiltered in^:: ^c%i^    ^Bfiltered out^:: ^c%i^ (^c%[.1]P^:)\n" ,
		stats.filteredInDocuments , stats.filteredOutDocuments , stats.filteredOutDocuments / ( stats.filteredInDocuments + stats.filteredOutDocuments ) || 0
	) ;
	term( "  ^+^WFiltered embedded documents^ -- ^Bfiltered in^:: ^c%i^    ^Bfiltered out documents^:: ^c%i^ (^c%[.1]P^:)\n" ,
		stats.filteredInEmbeddedDocuments , stats.filteredOutEmbeddedDocuments , stats.filteredOutEmbeddedDocuments / ( stats.filteredInEmbeddedDocuments + stats.filteredOutEmbeddedDocuments ) || 0
	) ;
	term( "  ^+^WPost-processed documents^ -- ^Bpost-processed^:: ^c%i^    ^Blink post-processed^:: ^c%i^:\n" ,
		stats.postProcessedDocuments , stats.linkPostProcessedDocuments
	) ;
	term( "  ^+^WMisc^ -- ^Bdeduped documents^:: ^c%i^    ^Bduplicated IDs^:: ^c%i^    ^Bdeduped embedded documents^:: ^c%i^:\n" ,
		stats.dedupedDocuments , stats.duplicatedIds , stats.dedupedEmbeddedDocuments
	) ;
}



function importSubReporting( term , stats ) {
	term( "  ^+^WDocuments^ -- ^Btotal^:: ^c%i^    ^Bsaved^:: ^c%i^ (^c%[.1]P^:)\n" ,
		stats.documents , stats.savedDocuments , stats.savedDocuments / stats.documents || 0
	) ;
	term( "  ^+^WEmbedded documents^ -- ^Bembedded^:: ^c%i^    ^Borphans^:: ^c%i^ (^c%[.1]P^:)\n" ,
		stats.embeddedDocuments , stats.orphanEmbeddedDocuments , stats.orphanEmbeddedDocuments / ( stats.embeddedDocuments + stats.orphanEmbeddedDocuments ) || 0
	) ;
	if ( stats.links || stats.orphanLinks ) {
		term( "  ^+^WLinks^ -- ^Blinks^:: ^c%i^    ^Borphans^:: ^c%i^ (^c%[.1]P^:)    ^Blinking documents^:: ^c%i^    ^Bsaved^:: ^c%i^ (^c%[.1]P^:)\n" ,
			stats.links , stats.orphanLinks , stats.orphanLinks / ( stats.links + stats.orphanLinks ) || 0 ,
			stats.linkingDocuments , stats.savedLinkingDocuments , stats.savedLinkingDocuments / stats.linkingDocuments || 0
		) ;

		for ( let toCollectionName in stats.perLinkedCollections ) {
			let linkedCollectionStats = stats.perLinkedCollections[ toCollectionName ] ;
			term( "    --> ^WLinks to ^M^/%s^ -- ^Blinks^:: ^c%i^    ^Borphans^:: ^c%i^ (^c%[.1]P^:)\n" ,
				toCollectionName ,
				linkedCollectionStats.links , linkedCollectionStats.orphanLinks , linkedCollectionStats.orphanLinks / ( linkedCollectionStats.links + linkedCollectionStats.orphanLinks ) || 0
			) ;
		}
	}
	term( "  ^+^WFiltered documents^ -- ^Bfiltered in^:: ^c%i^    ^Bfiltered out^:: ^c%i^ (^c%[.1]P^:)\n" ,
		stats.filteredInDocuments , stats.filteredOutDocuments , stats.filteredOutDocuments / ( stats.filteredInDocuments + stats.filteredOutDocuments ) || 0
	) ;
	term( "  ^+^WFiltered embedded documents^ -- ^Bfiltered in^:: ^c%i^    ^Bfiltered out^:: ^c%i^ (^c%[.1]P^:)\n" ,
		stats.filteredInEmbeddedDocuments , stats.filteredOutEmbeddedDocuments , stats.filteredOutEmbeddedDocuments / ( stats.filteredInEmbeddedDocuments + stats.filteredOutEmbeddedDocuments ) || 0
	) ;
	term( "  ^+^WPost-processed documents^ -- ^Bpost-processed^:: ^c%i^    ^Blink post-processed^:: ^c%i^:\n" ,
		stats.postProcessedDocuments , stats.linkPostProcessedDocuments
	) ;
	term( "  ^+^WMisc^ -- ^Bdeduped documents^:: ^c%i^    ^Bduplicated IDs^:: ^c%i^    ^Bdeduped embedded documents^:: ^c%i^:\n" ,
		stats.dedupedDocuments , stats.duplicatedIds , stats.dedupedEmbeddedDocuments
	) ;
}



commands.exec = async function( configPath , args ) {
	var script = args.script ;

	delete args.command ;
	delete args.script ;

	var app = new restQuery.App( configPath ) ;
	app.installExitHandlers() ;

	var scriptFn = tree.dotPath.get( app.scripts , script ) ;

	if ( typeof scriptFn !== 'function' ) {
		console.error( "Script '" + script + "' not found" ) ;
		process.exit( 1 ) ;
	}

	try {
		await scriptFn( app , args ) ;
	}
	catch ( error ) {
		console.error( error ) ;
		process.exit( 1 ) ;
	}

	process.exit() ;
} ;



commands['install-extension'] = async function( configPath , args ) {
	await restQuery.exm.installExtension( args.extensionId , args.active , args.namespace ) ;
	process.exit() ;
} ;



commands['list-extensions'] = async function( configPath , args ) {
	var lastNs = null ;

	console.log( "\nExtension list:\n" ) ;

	for ( let ns in global.EXM.ns ) {
		let exm = global.EXM.ns[ ns ] ;
		for ( let [ extensionId , extension ] of exm.extensions ) {
			if ( lastNs !== ns ) {
				console.log( "Namespace: " + exm.ns ) ;
				lastNs = ns ;
			}

			console.log( "    Extension: " + extension.id + ' v' + extension.version + '  (' + extension.path + ')' ) ;
		}
	}

	if ( ! lastNs ) { console.log( "None" ) ; }
	console.log() ;
	//console.log( "Exm:" , restQuery.exm ) ;

	process.exit() ;
} ;



commands.mon = function( configPath , args ) {
	const kungFig = require( 'kung-fig' ) ;
	const LogfellaClient = require( "logfella-client" ) ;

	// Load the whole config using Kung-Fig
	var transport , logfellaClient ,
		appConfig = kungFig.load( configPath ) ;

	if (
		! appConfig.log
		|| ! Array.isArray( appConfig.log.transports )
		|| ! ( transport = appConfig.log.transports.find( t => t.type === 'netServer' ) )
	) {
		console.error( "No Logfella Mon transport found!" ) ;
		process.exit( 1 ) ;
	}

	logfellaClient = new LogfellaClient( { port: transport.port } ) ;
	logfellaClient.start() ;
} ;

