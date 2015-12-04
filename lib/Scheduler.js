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

/* global WeakMap */



// Load modules
var events = require( 'events' ) ;

var async = require( 'async-kit' ) ; 
var rootsDb = require( 'roots-db' ) ;

var restQuery = require( './restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'rest-query' ) ;





			/* Scheduler */



function Scheduler() { throw new Error( '[restQuery] Cannot create a Scheduler object directly' ) ; }
module.exports = Scheduler ;

Scheduler.prototype = Object.create( events.prototype ) ;
Scheduler.prototype.constructor = Scheduler ;



Scheduler.create = function createScheduler( app , config )
{
	var scheduler = Object.create( Scheduler.prototype , {
		app: { value: app } ,
		tasks: { value: config.tasks || [] , enumerable: true } ,
		period: { value: config.period || 10000 , enumerable: true , writable: true } ,
		timer: { value: null , enumerable: true , writable: true } ,
	} ) ;
	
	return scheduler ;
} ;



Scheduler.prototype.run = function run()
{
	log.info( 'Starting the scheduler for tasks: %s' , this.tasks ) ;
	
	this.timer = setTimeout( this.getTasks.bind( this ) , this.period ) ;
} ;



Scheduler.prototype.getTasks = function getTasks()
{
	var self = this , scheduledTasks ;
	
	scheduledTasks = this.app.collectionNodes.scheduledTasks.collection ;
	
	scheduledTasks.collect( {} , function( error , batch ) {
		
		if ( error )
		{
			log.error( 'Scheduler#getTasks: %E' , error ) ;
			self.timer = setTimeout( self.getTasks.bind( self ) , self.period ) ;
			return ;
		}
		
		log.info( 'Tasks retrieved: %J' , batch ) ;
		self.timer = setTimeout( self.getTasks.bind( self ) , self.period ) ;
	} ) ;
} ;



