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



// Load modules
var restQuery = require( './restQuery.js' ) ;

var ErrorStatus = require( 'error-status' ) ;
var doormen = require( 'doormen' ) ;
var tree = require( 'tree-kit' ) ;





			/* ScheduledTasksCollectionNode */



function ScheduledTasksCollectionNode() { throw new Error( '[restQuery] Cannot create a ScheduledTasksCollectionNode object directly' ) ; }
module.exports = ScheduledTasksCollectionNode ;

ScheduledTasksCollectionNode.prototype = Object.create( restQuery.CollectionNode.prototype ) ;
ScheduledTasksCollectionNode.prototype.constructor = restQuery.ScheduledTasksCollectionNode ;



// WIP...

ScheduledTasksCollectionNode.schema = tree.extend( { deep: true } , {} , restQuery.CollectionNode.schema , {
	
} ) ;



ScheduledTasksCollectionNode.create = function createScheduledTasksCollectionNode( app , schema , collectionNode )
{
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.ScheduledTasksCollectionNode.prototype ) ; }
	
	doormen( ScheduledTasksCollectionNode.schema , schema ) ;
	
	schema.properties.scheduledOn = {
		instanceOf: Date ,
		sanitize: 'toDate' ,
		tier: 5
	} ;
	
	schema.properties.scheduledFor = {
		instanceOf: Date ,
		sanitize: 'toDate' ,
		tier: 5
	} ;
	
	schema.properties.task = {
		type: 'string' ,
		tier: 5
	} ;
	
	schema.properties.data = {
		type: 'object' ,
		default: {} ,
		tier: 5
	} ;
	
	// Document in this collection can be locked
	schema.canLock = true ;
	schema.lockTimeout = 1000 ;
	
	// hostname:pid of the process that have done the task?
	schema.properties.doneBy = {
		optional: true ,
		type: 'string' ,
		tier: 5
	} ;
	
	schema.properties.doneAt = {
		optional: true ,
		type: Date ,
		sanitize: 'toDate' ,
		tier: 5
	} ;
	
	// Indexes
	schema.indexes.push( { properties: { scheduledFor: 1 , _lockedBy: 1 , _lockedAt: 1 } } ) ;
	schema.indexes.push( { properties: { task: 1 , scheduledFor: 1 , _lockedBy: 1 , _lockedAt: 1 } } ) ;
	
	// Call the parent constructor
	restQuery.CollectionNode.create( app , 'scheduledTasks' , schema , collectionNode ) ;
	
	// Add methods
	//collectionNode.methods.blah = ScheduledTasksCollectionNode.prototype.blahMethod.bind( collectionNode ) ;
	
	return collectionNode ;
} ;



ScheduledTasksCollectionNode.prototype.initDocument = function initDocument( incomingDocument )
{
	// Overwrite some data given by the user
	incomingDocument.scheduledOn = new Date() ;
	incomingDocument._lockedBy = null ;
	incomingDocument._lockedAt = null ;
	incomingDocument.doneBy = null ;
	incomingDocument.doneAt = null ;
} ;



