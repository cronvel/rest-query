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



const events = require( 'events' ) ;
const async = require( 'async-kit' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;



/* Scheduler */



function Scheduler( app , config ) {
	this.app = app ;
	this.tasks = config.tasks || [] ;
	this.period = config.period || 10000 ;
	this.timer = null ;
}

module.exports = Scheduler ;

Scheduler.prototype = Object.create( events.prototype ) ;
Scheduler.prototype.constructor = Scheduler ;



Scheduler.prototype.run = function() {
	log.info( 'Starting the scheduler for tasks: %s' , this.tasks ) ;

	this.timer = setTimeout( this.doTasks.bind( this ) , this.period ) ;
} ;



Scheduler.prototype.doTasks = function() {
	var scheduledTasks , query , nextTimeout ;

	// Next timeout is randomly set, ranging from half to one and a half of the period
	nextTimeout = this.period * ( 0.5 + Math.random() ) ;

	query = {
		scheduledFor: { $lt: new Date() }
	} ;

	scheduledTasks = this.app.collectionNodes.scheduledTasks.collection ;

	scheduledTasks.lockRetrieveRelease( query , ( error , batch , releaseCallback ) => {
		if ( error ) {
			log.error( 'Scheduler#doTasks: %E' , error ) ;

			releaseCallback( ( error_ , released ) => {
				if ( error_ ) { log.error( 'Scheduler#doTasks: %E' , error_ ) ; }
				this.timer = setTimeout( () => this.doTasks() , nextTimeout ) ;
			} ) ;

			return ;
		}

		//log.info( 'Tasks retrieved: %J' , batch ) ;

		async.foreach( batch , ( scheduledTask , foreachCallback ) => {

			if ( ! this.app.workers[ scheduledTask.task ] ) {
				log.warning( "There is no worker for task '%s'" , scheduledTask.task ) ;
				foreachCallback() ;
				return ;
			}

			var workerContext = {} ;

			log.info( "Triggering worker '%s'" , scheduledTask.task ) ;

			this.app.workers[ scheduledTask.task ].call( this.app , scheduledTask , workerContext , ( error_ ) => {

				if ( error_ ) {
					// Nothing to do, the task will be retried
					foreachCallback() ;
					return ;
				}

				// The worker ran fine, we can remove the scheduled task
				scheduledTask.$.delete( () => {
					log.info( "Task removed!" ) ;
					foreachCallback() ;
				} ) ;
			} ) ;
		} )
			.parallel()
			.exec( ( error_ ) => {
			//setTimeout( () => {
				releaseCallback( ( error__ , released ) => {
					if ( error__ ) { log.error( 'Scheduler#doTasks: %E' , error__ ) ; }
					this.timer = setTimeout( () => this.doTasks() , nextTimeout ) ;
				} ) ;
			//} , 500 ) ;
			} ) ;
	} ) ;
} ;

