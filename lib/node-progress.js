/*!
 * node-progress
 * Copyright(c) 2011 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Expose `ProgressBar`.
 */

exports = module.exports = ProgressBar;

/**
 * Bars currently loaded.
 * @type {Array}
 */
var bars = [];
/**
 * Cache of bar instance renders.
 * @type {Array}
 */
var barLines = {};
/**
 * Number of bars current loaded.
 * @type {number}
 */
var barInc = 0;

/**
 * The console command for next line.
 * @type {string}
 */
var newLine = "\033[1B";


/**
 * Initialize a `ProgressBar` with the given `options`.
 *
 * Options:
 *
 *   - `format` The string format for the progress bar. (Default: [:bar] :percent)
 *   - `total` total number of ticks to complete
 *   - `width` the number of columns in the progress bar (Default: 40)
 *   - `stream` the output stream defaulting to stdout
 *   - `complete` completion character defaulting to "="
 *   - `incomplete` incomplete character defaulting to "-"
 *   - `debounce` number of milliseconds to wait before re-rendering. (Default: null)
 *
 * @param {Object} options
 * @api public
 */

function ProgressBar(options) {
  var me = this;
  barInc ++;
  var id = barInc, timeSamples = [], sampleCountMax = 20;
  bars.push(id);
  me.id=id

  options = options || {};
  if ('number' !== typeof options.total) throw new Error('total required');
  me.stream = options.stream || process.stdout;
  me.fmt = options.format || '[:bar] :percent';
  me.curr = 0;
  me.total = options.total;
  me.width = options.width || 40;
  me.chars = {
    complete : options.complete || '█',
    incomplete : options.incomplete || '░',
     head       : options.head || (options.complete || '=')
  };
  me.debounceLimit = options.debounce || null;
  me.elapsedTime = 0.0001;
  me.opsPerSec = 0;
  me.totalOpsPerSec = 0;
  me.startTime = process.hrtime();
  me.writeLimit = null;
  me.report = {};
  me.onComplete = options.onComplete|| function(){};
  me.onStart = options.onStart|| function(){};
  me.onUpdate = options.onUpdate || function(){};
  me.onTick = options.onTick || function(){};
  me.onTickFmt = options.onTickFmt || ':current / :total (:percent)';
  me.justMe = options.justMe || false;
  me.noRender = options.noRender || false;
  me.percent = 0;

  me.sample = 0;

  // ID must NOT change.
  me.getId = function () {
    return id;
  };

  me.sampleTimer = setInterval(function () {
    timeSamples.push(me.sample);
    me.sample = 0;
    if (timeSamples.length > sampleCountMax) {
      timeSamples.shift();
    }
    var sum = 0;
    for (var i = 0; i < timeSamples.length; i += 1) {
      sum += timeSamples[ i ];
    }
    me.opsPerSec = Math.floor((sum / timeSamples.length) * 10) / 10;
  }, 1000);

  me.lastDraw='';
  me.clear=options.clear||false;
  me.title=options.title || '->';
  me.logResult=options.logResult || true;
  me.delay=options.delay || 1000;

  me.onStart.call(this);
}

/**
 * Public method for getting the elapsed time.
 * This has been updated to be far more accurate.
 * @returns {string}
 */
ProgressBar.prototype.elapsed = function () {
  var t = timeDiff(this.startTime);
  this.totalOpsPerSec = Math.floor(this.curr / t * 10) / 10;
  this.elapsedTime = t;
  return secondsToMin(Math.floor(t * 1000) / 1000);
};

/**
 * Public method for getting remaining time.
 * This has been updated to be far more accurate.
 * @returns {string}
 */
ProgressBar.prototype.timeRemaining = function () {
  var ticksLeft = this.total - this.curr,
    timeLeft = ticksLeft / this.opsPerSec;
    if(timeLeft===Infinity){
      timeLeft=0;
    }
  return secondsToMin(timeLeft);
};

/**
 * Ensures rendering is debounced. We don't want to overload the console.
 */
ProgressBar.prototype.render = function () {

  if (this.curr === this.total) {
    try {
      this.writeLimit.clearTimeout();
    }
    catch (e) {
    }
    clearInterval(this.sampleTimer);
    doRender(this);
    buildReport(this);
    if (typeof this.onComplete === 'function') {
       this.terminate();
      this.onComplete.call(this);
      this.complete=true;

      if(this.logResult){
        this.logReport();
      }
    }
    return;
  }


  if (! this.debounceLimit) {
    doRender(this);
  } else {
    if (this.writeLimit !== null) return;
    var me = this;
    this.writeLimit = setTimeout(function () {
          doRender(me);
      me.writeLimit = null;
    }, this.debounceLimit);
  }
};

ProgressBar.prototype.setTick = function (newTick) {

  // progress complete
  if ((this.curr = newTick) > this.total) {
    this.complete = true;
    //this.stream.write('\r\033[2K');
    return;
  }

  this.render();
};

/**
 * "tick" the progress bar with optional `len` and
 * optional `tokens`.
 *
 * @param {Number} [len]
 * @api public
 */
ProgressBar.prototype.tick = function (len) {
  if (len !== 0) {
    len = len || 1;
  }

  this.sample += len;

  // progress complete
  if ((this.curr += len) > this.total) {
    this.complete = true;
    //this.stream.write('\r\033[2K');
    return;
  }

  if (this.onTick && typeof(this.onTick) === 'function') {
    this.onTick.call(this, doFormat(this, this.onTickFmt));
  }
  this.onUpdate.call(this);
  this.render();


};

/**
 * "interrupt" the progress bar and write a message above it.
 * @param {string} message The message to write.
 * @api public
 */

ProgressBar.prototype.interrupt = function (message) {
  // clear the current line
  this.stream.clearLine();
  // move the cursor to the start of the line
  this.stream.cursorTo(0);
  // write the message text
  this.stream.write(message);
  // terminate the line after writing the message
  this.stream.write('\n');
  // re-display the progress bar with its lastDraw
  this.stream.write(this.lastDraw);
};

ProgressBar.prototype.clearLine = function () {
  this.stream.cursorTo(0);
  this.stream.write('');
 this.stream.clearLine(1);

};

ProgressBar.prototype.logReport = function () {
  console.log(newLine);
  console.log('Ready: ', this.title);
  console.log(this.report);
  console.log(newLine);

};



/**
 * Terminates a progress bar.
 *
 * @api public
 */

ProgressBar.prototype.terminate = function () {
  if (this.clear) {
    if (this.stream.clearLine) {
      this.stream.clearLine();
      this.stream.cursorTo(0);
    }
  } else {
    this.stream.write('\n');
  }
};

/**
 * Builds and caches the completion report for the progress bar.
 * @param me {ProgressBar}
 */
function buildReport(me) {
  me.report = {
    title: me.title,
    barId : me.getId(),
    counted : me.curr,
    expected : me.total,
    totalTime : secondsToMin(me.elapsedTime),
    precisionTotalTime : me.elapsedTime,
    sampledOpsPerSec : me.opsPerSec,
    generalOpsPerSec : me.totalOpsPerSec
  };
}

/**
 * Moved rendering into its own function outside of the constructor.
 * @param me {ProgressBar}
 */
function doRender(me) {
  if(me.noRender) return;
  // Added a lot of additional formatting options.
  var str = doFormat(me,me.title + ' ' + me.fmt);

  // Attempting to get more than one progress bar at a time.
  // ** Doesn't seem to work right on Windows. :( **
  var id = me.getId();
  barLines[id] = {str,me:me};
   var bigStr="";
   if(Object.keys(barLines).length>1){
     Object.keys(barLines).forEach(item=>{
       if(barLines[item].me.justMe){
          barLines[item].me.debounceLimit=me.delay;
       }

        bigStr = bigStr  + barLines[item].me.title + barLines[item].str +newLine +' ' ;
     });
   }else{
     bigStr=str;
   }





  if (me.lastDraw !== str && !me.complete) {
    me.stream.clearLine(1);
    me.stream.cursorTo(0);
    me.stream.write(me.justMe ? str : bigStr);

    me.lastDraw = str;

  }



}

function doFormat(me, format) {
  var incomplete, complete, completeLength;
  var percent = me.curr / me.total * 100;
  var ratio = me.curr / me.total;
  ratio = Math.min(Math.max(ratio, 0), 1);
  me.percent = percent.toFixed(0);



  var str= format
    .replace(':c[blue]', "\033[1;34m")
    .replace(':c[white]', "\033[1;37m")
    .replace(':c[yellow]', "\033[1;33m")
    .replace(':c[red]', "\033[1;31m")
    .replace(':c[none]', "\033[0m")
    .replace(":nl", newLine)
    .replace(':current', me.curr)
    .replace(':total', me.total)
    .replace(':elapsed', me.elapsed())
    .replace(':eta', me.timeRemaining())
    .replace(':percent', percent.toFixed(0) + '%')
    .replace(':opsec', me.opsPerSec.toString());

  var availableSpace = Math.max(0, me.stream.columns - str.replace(':bar', '').length);
  if(availableSpace && process.platform === 'win32'){
    availableSpace = availableSpace - 1;
  }

  var width = Math.min(me.width, availableSpace);

  completeLength = Math.round(width * ratio);
  if(!completeLength){
    completeLength=0;
  }
  complete = Array(Math.max(0, completeLength + 1)).join(me.chars.complete);
  incomplete = Array(Math.max(0, width - completeLength + 1)).join(me.chars.incomplete);


  if(completeLength > 0)
    complete = complete.slice(0, -1) + me.chars.head;

  /* fill in the actual progress bar */


  str = str.replace(':bar', complete + incomplete);
  return str;
}

/**
 * Calculates the time using precision timing.
 * @param start {process.hrtime}
 * @returns {number}
 */
function timeDiff(start) {
  var diff = process.hrtime(start);
  return ((diff[ 0 ] * 1e9 + diff[ 1 ]) / 1e9);
}

/**
 * Better formatting for the seconds.
 * @param sec {number}
 * @returns {string}
 */
function secondsToMin(sec) {
  var hour = 60 * 60, min = 60;
  var totalTimeHr = Math.floor(sec / hour),
    totalTimeMin = Math.floor((sec - (totalTimeHr * hour)) / min),
    totalTimeSec = Math.floor(sec - (totalTimeMin * min) - (totalTimeHr * hour));
  return (totalTimeHr > 0 ? totalTimeHr + 'hr ' : '') + totalTimeMin + "min " + totalTimeSec + "sec";
}
