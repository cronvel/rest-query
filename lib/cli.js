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



const fs = require( 'fs' ) ;
const path = require( 'path' ) ;

const string = require( 'string-kit' ) ;
const cliManager = require( 'utterminal' ).cli ;

const restQuery = require( './restQuery.js' ) ;
const restQueryPackage = require( '../package.json' ) ;

const commands = {} ;



module.exports = function() {
	/* eslint-disable indent */
	cliManager.package( require( '../package.json' ) )
		.app( 'Rest Query' )
		.usage( "[--parameter1 value1] [--parameter2 value2] [...]" )
		.description( "Rest Query is the runtime for the awesome REST framework." )
		.introIfTTY
		.helpOption
		// Don't add .commonOptions, it interferes with restquery's log config which is an object
		.camel
		.commonCommands
		.command( "run" )
			.description( "Run the Rest Query application." )
			.opt( 'config' ).string
				.description( "The main application config file, using .kfg" )
		.command( "build-indexes" )
			.description( "Build all collections' indexes." )
			.opt( 'config' ).string
				.description( "The main application config file, using .kfg" )
		.command( "init-db" )
			.description( "Init the DB." )
			.arg( 'dbPath' ).string
				.description( "The DB file, using .kfg" )
			.opt( 'config' ).string
				.description( "The main application config file, using .kfg" )
			//.opt( 'option-name' ).number
			//	.description( "description" )
	/* eslint-enable indent */

	var args = cliManager.run() ;
	
	var configPath = args.config ;
	delete args.config ;
	
	if ( configPath ) {
		try {
			var configFile = fs.realpathSync( configPath ) ;
		}
		catch ( error ) {
			console.error( error.message ) ;
			process.exit( 1 ) ;
		}
	}
	else {
		try {
			configPath = path.join( process.cwd() , 'app' , 'main.kfg' ) ;
			var configFile = fs.realpathSync( configPath ) ;
		}
		catch ( error ) {
			try {
				configPath = path.join( process.cwd() , 'main.kfg' ) ;
				var configFile = fs.realpathSync( configPath ) ;
			}
			catch ( error ) {
				console.error( error.message ) ;
				process.exit( 1 ) ;
			}
		}
	}
	
	commands[ args.command ]( configFile , args ) ;
} ;



commands.run = function( configFile , args ) {
	var app = new restQuery.App( configFile , args ) ;
	app.run() ;
} ;



commands['build-indexes'] = async function( configFile , args ) {
	var app = new restQuery.App( configFile , args ) ;
	await app.buildIndexes() ;
	process.exit() ;
} ;



commands['init-db'] = async function( configFile , args ) {
	var app = new restQuery.App( configFile , args ) ;
	await app.buildIndexes() ;
	await app.initDb( args.dbPath ) ;
	process.exit() ;
} ;

