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

"use strict" ;



const events = require( 'events' ) ;
const Promise = require( 'seventh' ) ;

const log = require( 'logfella' ).global.use( 'rest-query-scheduler' ) ;



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
	this.timer = setTimeout( () => this.doTasks() , this.period ) ;
} ;



Scheduler.prototype.doTasks = async function() {
	var scheduledTasks , query , nextTimeout ;

	// Next timeout is randomly set, ranging from half to one and a half of the period
	nextTimeout = this.period * ( 0.5 + Math.random() ) ;

	query = {
		scheduledFor: { $lt: new Date() }
	} ;

	scheduledTasks = this.app.collectionNodes.scheduledTasks.collection ;

	try {
		await scheduledTasks.lockedPartialFind( query , async ( batch ) => {
			//log.info( 'Tasks retrieved: %J' , batch ) ;

			await Promise.map( batch , async ( scheduledTask ) => {
				if ( ! this.app.workers[ scheduledTask.task ] ) {
					log.warning( "There is no worker for task '%s'" , scheduledTask.task ) ;
					return ;
				}

				var workerContext = {} ;

				log.info( "Triggering worker '%s'" , scheduledTask.task ) ;

				try {
					await this.app.workers[ scheduledTask.task ].call( this.app , scheduledTask , workerContext ) ;

					// The worker ran fine, we can remove the scheduled task
					await scheduledTask.delete() ;
					log.info( "Task removed!" ) ;
				}
				catch ( error ) {
					// Nothing to do, the task will be retried
					log.error( "Worker error: %E" , error ) ;
					return ;
				}
			} ).catch( error => {
				log.error( 'Scheduler#doTasks: %E' , error ) ;
			} ) ;

			//this.timer = setTimeout( () => this.doTasks() , nextTimeout ) ;
		} ) ;
	}
	catch( error ) {
		// Ignore errors
		log.error( 'Scheduler#doTasks: %E' , error ) ;
	}

	this.timer = setTimeout( () => this.doTasks() , nextTimeout ) ;
} ;

