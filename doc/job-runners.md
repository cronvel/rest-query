

## Job Runners

A Job Runner is a function of the form: `function( jobData , job , app )`.

* jobData `any` the data to be processed by the job runner, this is pure userland
* job `Scheduler.Job` it is the Job instance calling this runner, it can be used to call the Job's API
* app `App` it is App instance running the Scheduler

The Scheduler await for this function, so it MUST be async or return a `Promise`.
After awaiting, the job is considered done and no more actions should be hanging.

If it throws, the job is considered failed and may be retried later.
If it is a permanent error, the job runner should throw an Error having a `fatal` property set to true.

