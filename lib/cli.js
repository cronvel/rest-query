/*
	Rest Query

	Copyright (c) 2014 - 2019 Cédric Ronvel

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
			.description( "The main application config file, using .kfg" )
		.command( [ 'server' , 'start' ] )
			.description( "Start the Rest Query server application." )
			.opt( 'build-indexes' ).flag
				.description( "Build all collections' indexes." )
			.opt( 'init-db' ).string
				.typeLabel( 'db-path' )
				.description( "The DB file, using .kfg" )
			.opt( 'init-db-overwrite' ).flag
				.description( "Overwrite existing documents" )
			.opt( 'init-db-create' ).flag
				.description( "Create documents if unexistant" )
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
		.command( 'exec' )
			.description( "Execute a script." )
			.arg( 'script' ).string.mandatory
				.typeLabel( 'script-name' )
				.description( "The script's name" )
			.restArgs( 'args' )
				.description( "The script's arguments" )
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



commands.exec = async function( configPath , args ) {
	var script = args.script ;

	delete args.command ;
	delete args.script ;

	var app = new restQuery.App( configPath ) ;

	var scriptFn = tree.dotPath.get( app.scripts , script ) ;

	if ( typeof scriptFn !== 'function' ) {
		console.error( "Script '" + script + "' not found" ) ;
		process.exit( 1 ) ;
	}

	await scriptFn( app , args ) ;

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

