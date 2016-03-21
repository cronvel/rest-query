

## Workers

A worker is a function of the form: `function( scheduledTask , workerContext , callback )`.

* scheduledTask `Object` it is a document of the ScheduledTask collection, that triggered the worker, userland code may
	store custom data into the `scheduledTask.data` object.
	
* workerContext `Object` currently unused (this is an empty object `{}`)

* callback `Function( error )` a completion callback, **if error is set, the task is not removed**: it will be retried!

The *this* context is the instance of `App`.

