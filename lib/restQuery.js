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

/*
	TODO:
		- remove binding in restQuery.App(), should probably turn those into functions...
		- handle connection/session
		- handle auth
*/

"use strict" ;



const restQuery = {} ;
module.exports = restQuery ;



// Exm API, should come before loading any modules
restQuery.exm = require( './exm.js' ) ;

// Init and load active extensions
restQuery.initExtensions = rootDir => restQuery.exm.init( rootDir ) ;



require( './doormen-extensions.js' ) ;

const shared = require( 'rest-query-shared' ) ;
restQuery.path = shared.path ;
restQuery.charmap = shared.charmap ;
restQuery.slugify = shared.slugify ;

// Those modules can be useful for user-land code AND should be shared and up to date with restQuery.
// So, userland code should use that rather than adding it to their package.json and requiring it.
// Should be loaded first.
restQuery.log = require( 'logfella' ) ;
restQuery.ErrorStatus = require( 'error-status' ) ;
restQuery.TokenGenerator = require( 'token-kit' ) ;

// Main RestQuery modules
restQuery.serializers = require( './serializers.js' ) ;
restQuery.accessSchema = require( './accessSchema.js' ) ;
restQuery.hooks = require( './hooks.js' ) ;
restQuery.HttpModule = require( './HttpModule.js' ) ;
restQuery.App = require( './App.js' ) ;
restQuery.Node = require( './Node.js' ) ;
restQuery.ObjectNode = require( './ObjectNode.js' ) ;
restQuery.CollectionNode = require( './CollectionNode.js' ) ;
restQuery.RootCollectionNode = require( './RootCollectionNode.js' ) ;
restQuery.UsersCollectionNode = require( './UsersCollectionNode.js' ) ;
restQuery.GroupsCollectionNode = require( './GroupsCollectionNode.js' ) ;
restQuery.JobsCollectionNode = require( './JobsCollectionNode.js' ) ;
restQuery.Performer = require( './Performer.js' ) ;
restQuery.Context = require( './Context.js' ) ;
restQuery.misc = require( './misc.js' ) ;
restQuery.cli = require( './cli.js' ) ;


// Expose to userland some lib used by RestQuery:

// Doormen has extensions
restQuery.doormen = require( 'doormen' ) ;
restQuery.Scheduler = require( 'roots-scheduler' ) ;

