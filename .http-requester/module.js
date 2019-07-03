/*
	The Cedric's Swiss Knife (CSK) - CSK HTTP Requester

	Copyright (c) 2015 - 2019 Cédric Ronvel

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



var api ;

exports.name = 'Rest-Query' ;

exports.init = async function( api_ ) {
	api = api_ ;

	// Set application/json by default
	await api.emulate( [
		'Content-Type: application/json'
	] ) ;
} ;

var commands = exports.commands = {} ;



// login <login> <password>
commands.login = async function( args ) {
	var token ;

	await api.emulate( [
		'Content-Type: application/json' ,
		'body ' + JSON.stringify( { login: args[ 0 ] , password: args[ 1 ] , type: 'header' } ) ,
		'post /Users/CREATE-TOKEN'
	] ) ;
	
	var body = api.lastResponse().body ;
	
	if ( ! body ) {
		api.term.red( "No response body\n" ) ;
		return ;
	}
	
	try {
		token = JSON.parse( body ).token ;
	}
	catch ( error ) {
		api.term( "API %E\n" , error ) ;
		return ;
	}

	await api.emulate( 'X-Token: ' + token ) ;
} ;



// createUser <login> <password> <email> <firstName> <lastName>
commands.createUser = async function( args ) {
	var data = {
		login: args[ 0 ] ,
		password: args[ 1 ] ,
		email: args[ 2 ] ,
		firstName: args[ 3 ] ,
		lastName: args[ 4 ]
	} ;

	await api.emulate( [
		'Content-Type: application/json' ,
		'body ' + JSON.stringify( data ) ,
		'post /Users'
	] ) ;
} ;

