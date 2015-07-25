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

/*
	TODO:
		- remove binding in restQuery.App(), should probably turn those into functions...
		- handle connection/session
		- handle auth
*/



var restQuery = {} ;
module.exports = restQuery ;

require( './doormen-extensions.js' ) ;
restQuery.misc = require( './misc.js' ) ;
restQuery.charmap = require( './charmap.js' ) ;
restQuery.slugify = require( './slugify.js' ) ;
restQuery.httpModule = require( './httpModule.js' ) ;
restQuery.App = require( './App.js' ) ;
restQuery.Node = require( './Node.js' ) ;
restQuery.ObjectNode = require( './ObjectNode.js' ) ;
restQuery.CollectionNode = require( './CollectionNode.js' ) ;
restQuery.UsersCollectionNode = require( './UsersCollectionNode.js' ) ;
restQuery.GroupsCollectionNode = require( './GroupsCollectionNode.js' ) ;
restQuery.Performer = require( './Performer.js' ) ;
restQuery.accessLevel = require( './accessLevel.js' ) ;
restQuery.cli = require( './cli.js' ) ;



restQuery.createApp = restQuery.App.create ;


