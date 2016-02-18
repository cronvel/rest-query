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
var fs = require( 'fs' ) ;
var minimist = require( 'minimist' ) ;

var restQuery = require( './restQuery.js' ) ;



module.exports = function cli()
{
	var configFile , parameters , app ;
	
	if ( process.argv.length < 3 )
	{
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
	
	app = restQuery.createApp( configFile , parameters ) ;
	app.run() ;
} ;


