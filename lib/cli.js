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
const string = require( 'string-kit' ) ;
const cliManager = require( 'utterminal' ).cli ;

const restQuery = require( './restQuery.js' ) ;
const restQueryPackage = require( '../package.json' ) ;


module.exports = function() {
	/* eslint-disable indent */
	cliManager.package( require( '../package.json' ) )
		.app( 'Rest Query' )
		.usage( "[--parameter1 value1] [--parameter2 value2] [...]" )
		.introIfTTY
		.commonOptions
		.commonCommands
		.description( "Rest Query is the runtime for the awesome REST framework." )
		.command( "run" )
			.description( "Run the Rest Query application." )
			.arg( 'config-file' ).string
				.description( "The main application config file, in .kfg" )
			//.opt( 'option-name' ).number
			//	.description( "description" )
	/* eslint-enable indent */

	var args = cliManager.run() ;
	
	try {
		var configFile = fs.realpathSync( args['config-file'] ) ;
	}
	catch ( error ) {
		console.error( error.message ) ;
		process.exit( 1 ) ;
	}

	var app = new restQuery.App( configFile , args ) ;
	app.run() ;
} ;



module.exports_ = function() {
	var configFile , parameters , app ;

	if ( process.stdout.isTTY ) {
		process.stdout.write( string.format( '^M^+Rest Query^: ^-v%s by Cédric Ronvel^:\n' , restQueryPackage.version ) ) ;
	}

	if ( process.argv.length < 3 ) {
		console.error( 'Usage is: rest-query <main-config-file> [--parameter1 value1] [--parameter2 value2] [...]' ) ;
		process.exit( 1 ) ;
	}

	parameters = require( 'minimist' )( process.argv.slice( 2 ) ) ;
	//console.log( parameters ) ;

	configFile = parameters._[ 0 ] ;

	// Cleanup parameters...
	delete parameters._ ;

	try {
		configFile = fs.realpathSync( configFile ) ;
	}
	catch ( error ) {
		console.error( error.message ) ;
		process.exit( 1 ) ;
	}

	app = new restQuery.App( configFile , parameters ) ;
	app.run() ;
} ;

