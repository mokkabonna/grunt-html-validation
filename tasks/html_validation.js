/*
 * grunt-html-validation
 * https://github.com/praveen/grunt-html-validation
 *
 * Copyright (c) 2013 Praveen Vijayan
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

	var w3cjs = require('w3cjs');
	var colors = require('colors');
	var fs = require('fs');
	var path = require('path');
	var request = require('request');
	var rval = require('../lib/remoteval');

	colors.setTheme({
		silly: 'rainbow',
		input: 'grey',
		verbose: 'cyan',
		prompt: 'grey',
		info: 'green',
		data: 'grey',
		help: 'cyan',
		warn: 'yellow',
		debug: 'blue',
		error: 'red',
		blue: 'blue'
	});

	var htmlContent = "",
		arryFile = [],
		counter = 0,
		msg = {
			error: "Something went wrong",
			ok: "Validated ",
			start: "Validating ",
			networkError: 'Network error re-validating..'.error,
			validFile: "Validated skipping..",
			nofile: ":- No file is specified in the path!",
			nextfile: "Skipping to next file..".verbose,
			eof: "End of File..".verbose,
			fileNotFound: "File not found..".error,
			downloading : "Downloading ",
			downloaded : "Downloaded ",
			remotePathError: "Remote path ".error + "(options->remotePath) ".grey + "is mandatory when remote files ".error+"(options-> remoteFiles) ".grey+"are specified!".error
		},
		len,
		fileStat = {},
		isModified,
		fileCount = 0,
		validsettings = "",
		reportArry =[],
		retryCount = 0,
		failLogger = grunt.log.error,
		reportFilename = "";

	grunt.registerMultiTask('validation', 'HTML W3C validation.', function() {
		// Merge task-specific and/or target-specific options with these defaults.
		var options = this.options({
			path: "validation-status.json",
			reportpath: "validation-report.json",
			reset: false,
			stoponerror: false,
			remotePath: false,
			maxTry: 3
		});

		var done = this.async(),
			files = grunt.file.expand(this.filesSrc),
			flen = files.length,
			readSettings = {},
			remoteArry = [];


		var makeFileList  = function (files) {
			return files.map(function(file){
				return options.remotePath + file;
			});
		}

		//Reset current validation status and start from scratch.
		if (options.reset) {
			grunt.file.write(options.path, '{}');
		}

		//throw no file warning if no regular files and no remote files
		if (!flen && !options.remoteFiles) {
			var nomsg = this.data.src;
			console.log(nomsg + msg.nofile.error);
		}

		var addToReport = function(fname, status) {
			var report = {};
			report.filename = fname;
			report.error = status;
			reportArry.push(report);
		};

		var validate = function(file, realName, callback) {

			//realName is optional and if omitted use file as real name and realName as callback
			if (typeof callback === 'undefined' && typeof realName === 'function') {
				callback = realName;
				realName = file;
			}


			if (grunt.file.exists(options.path)) {
				readSettings = grunt.file.readJSON(options.path);
			}
			var currFileStat = readSettings[file] || false;

			if (currFileStat) {
				console.log(msg.validFile.green + file);
				addToReport(realName, false);
				counter++;

				return;
			}

			if (file !== undefined) {
				grunt.verbose.writeln(msg.start + realName);
			}

			var results = w3cjs.validate({
				file: file, // file can either be a local file or a remote file
				// file: 'http://localhost:9001/010_gul006_business_landing_o2_v11.html',
				output: 'json', // Defaults to 'json', other option includes html
				callback: function(res) {

					if (!res.messages) {
						grunt.warn('failed fetching file, should implement retry');
						return;
					}

					len = res.messages.length;
					var validatedMsg  = msg.ok + file + '...';


					if (len) {

						var errors = [];
						grunt.log.write(validatedMsg);
						grunt.log.error();

						res.messages.forEach(function(item, index, all) {
							errors.push('Line ' + item.lastLine.toString().prompt + ': ' + item.message);
						});

						errors.push("No of errors: ".error + res.messages.length);
						failLogger(errors.join(grunt.util.linefeed));
						grunt.log.writeln();

						readSettings[file] = false;
						addToReport(realName, res.messages);
						callback(false);

					} else {
						grunt.log.write(validatedMsg);
						grunt.log.ok();

						readSettings[file] = true;
						addToReport(realName, false);
						callback(true);
					}

				}
			});

		};

		/*Remote validation
		*Note on Remote validation.
		* W3Cjs supports remote file validation but due to some reasons it is not working as expected. Local file validation is working perfectly. To overcome this remote page is fetch using 'request' npm module and write page content in '_tempvlidation.html' file and validates as local file.
		*/
		var totalFiles = files.length;
		var failures = files.length;
		var total = files.length;

		if(!options.remotePath && options.remoteFiles){
			console.log(msg.remotePathError)
			return;
		};

		if(options.remotePath && options.remotePath !== ""){
			files = makeFileList(files)
		}

		if(options.remoteFiles){

			if(typeof options.remoteFiles === 'object' && options.remoteFiles.length && options.remoteFiles[0] !=='' ){
				files = options.remoteFiles;

			}else{
				files = grunt.file.readJSON(options.remoteFiles);
			}

			files = makeFileList(files);

			var remainingCalls = files.length;
			var tempFiles = {};
			//get all the remote files and on callbacks start the async validation

			files.forEach(function(file) {
				grunt.verbose.writeln(msg.downloading + file);
			});

			rval(files, function(file, tempName) {
				grunt.verbose.writeln(msg.downloaded + file);
				remainingCalls--;
				if(options.async) {
					validate(tempName, file, function(success) {
						if(success) failures--;
						if(!remainingCalls) complete();
					}); //reverse order of arguments, no mistake
				}
				else{
					tempFiles[file] = tempName;
					remainingCalls--;
					if(!remainingCalls) validateAll(files, tempFiles);
				}
			});

			return;
		}


		if(!options.remoteFiles){
			validateAll(files);
		}


		//Validates async or sync based on async option
		function validateAll(files, tempFiles){

			function flush(files){
				var filename = files.shift();
				var tempOrReal = tempFiles ? tempFiles[filename] : filename;

				//valdiate first in array, then wait for it do be done, and repeat
				validate(tempOrReal, filename, function(success) {
					if(success) failures--;
					if(files.length) flush(files);
					else complete();
				});
			}

			if(options.async){
				files.forEach(function(file) {
					validate(file, function(success) {
						if(success) failures--;
						totalFiles--;
						if(!totalFiles) complete();
					});
				});
			}
			else{
				flush(files);
			}
		}

		function complete() {

			grunt.log.writeln((total - failures) + ' of '+ total +' files '+ 'passed' + ', ' + failures + ' failed.' )

			if (options.reportpath){
				grunt.file.write(options.reportpath, JSON.stringify(reportArry));
				grunt.verbose.writeln("Validation report generated: ".green + options.reportpath);
			}

			if (options.path){
				grunt.file.write(options.path, JSON.stringify(readSettings));
			}

			done();
		}




	});

};
