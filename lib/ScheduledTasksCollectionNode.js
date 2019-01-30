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



const restQuery = require( './restQuery.js' ) ;

//const ErrorStatus = require( 'error-status' ) ;
const doormen = require( 'doormen' ) ;
const tree = require( 'tree-kit' ) ;



/* ScheduledTasksCollectionNode */



function ScheduledTasksCollectionNode( app , schema ) {
	doormen( ScheduledTasksCollectionNode.schemaSchema , schema ) ;

	schema.properties.scheduledOn = {
		system: true ,
		instanceOf: Date ,
		sanitize: 'toDate' ,
		tags: [ 'system' ]
	} ;

	schema.properties.scheduledFor = {
		system: true ,
		instanceOf: Date ,
		sanitize: 'toDate' ,
		tags: [ 'system' ]
	} ;

	schema.properties.task = {
		type: 'string' ,
		system: true ,
		tags: [ 'system' ]
	} ;

	schema.properties.data = {
		type: 'object' ,
		system: true ,
		default: {} ,
		tags: [ 'system' ]
	} ;

	// Document in this collection can be locked
	schema.canLock = true ;
	schema.lockTimeout = 1000 ;

	// hostname:pid of the process that have done the task?
	schema.properties.doneBy = {
		optional: true ,
		type: 'string' ,
		system: true ,
		tags: [ 'system' ]
	} ;

	schema.properties.doneAt = {
		optional: true ,
		type: Date ,
		system: true ,
		sanitize: 'toDate' ,
		tags: [ 'system' ]
	} ;

	// Indexes
	restQuery.CollectionNode.ensureIndex( schema.indexes , { properties: { scheduledFor: 1 , _lockedBy: 1 , _lockedAt: 1 } } ) ;
	restQuery.CollectionNode.ensureIndex( schema.indexes , { properties: {
		task: 1 , scheduledFor: 1 , _lockedBy: 1 , _lockedAt: 1
	} } ) ;

	// Call the parent constructor
	restQuery.CollectionNode.call( this , app , 'scheduledTasks' , schema ) ;

	// Add methods
	//this.methods.blah = ScheduledTasksCollectionNode.prototype.blahMethod.bind( this ) ;
}

module.exports = ScheduledTasksCollectionNode ;

ScheduledTasksCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
ScheduledTasksCollectionNode.prototype.constructor = ScheduledTasksCollectionNode ;



// WIP...

ScheduledTasksCollectionNode.schemaSchema = tree.extend(
	{ deep: true } ,
	{} ,
	restQuery.CollectionNode.schemaSchema ,
	{}
) ;



ScheduledTasksCollectionNode.prototype.initDocument = function( incomingDocument ) {
	// Overwrite some data given by the user
	incomingDocument.scheduledOn = new Date() ;
	incomingDocument._lockedBy = null ;
	incomingDocument._lockedAt = null ;
	incomingDocument.doneBy = null ;
	incomingDocument.doneAt = null ;
} ;

