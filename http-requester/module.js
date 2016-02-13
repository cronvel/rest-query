/*
	The Cedric's Swiss Knife (CSK) - CSK HTTP Requester

	Copyright (c) 2015 - 2016 Cédric Ronvel 
	
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

// Test of modules



var api ;

exports.name = 'Rest-Query' ;

exports.init = function init( api_ ) { api = api_ ; } ;

var commands = exports.commands = {} ;


commands.login = function ( args , query , callback )
{
	api.emulateMulti( [
			'Content-Type: application/json' ,
			'body ' + JSON.stringify( { login: args[ 0 ] , password: args[ 1 ] , type: 'header' } ) ,
			'post /Users/CREATE-TOKEN' ,
		] ,
		function() {
			var token = JSON.parse( api.lastResponse().body ).token ;
			api.emulate( 'X-Token: ' + token , callback ) ;
		}
	) ;
} ;



commands.createUser = function ( args , query , callback )
{
	var name = args[ 0 ].split( '@' )[ 0 ].split( '.' ) ;
	
	api.emulateMulti( [
			'Content-Type: application/json' ,
			'body ' + JSON.stringify( {
				email: args[ 0 ] ,
				password: args[ 1 ] ,
				firstName: name[ 0 ] || 'Robert' ,
				lastName: name[ 1 ] || 'Polson' ,
			} ) ,
			'post /Users' ,
		] ,
		callback
	) ;
} ;



