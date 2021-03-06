/*
 * index.js: Import a CFP into Github issues for review.
 *
 * (C) 2013, Nodejitsu Inc.
 *
 */

var fs = require('fs'),
    path = require('path'),
    async = require('async'),
    GitHubApi = require('github');

//
// ### function cfp-github-importer (options, callback)
// #### @options {Object} Options for the import
//   - @auth {Object} Github Auth
//   - @repo {string} Fully qualified repo name (e.g. empirejs/2014-cfp)
//   - @file {string} Path to a *.tsv file matching
//
var importer = module.exports = function (options, callback) {
  var auth = options.auth.split(':');

  //
  // Setup basic Github client and template file
  //
  options.template = options.template || path.join(__dirname, 'templates', 'issue.md');
  options.github   = new GitHubApi({
    // required
    version: "3.0.0",
    // optional
    timeout: 5000
  });

  options.github.authenticate({
    type: 'basic',
    username: auth[0],
    password: auth[1]
  });

  async.waterfall([
    //
    // 1. Parse the file and read the existing issues
    //
    function parseAndRead(next) {
      async.parallel({
        proposals: async.apply(importer.parse, options.file),
        template:  async.apply(fs.readFile, options.template, 'utf8'),
        issues:    async.apply(importer.readIssues, options)
      }, next);
    },
    //
    // 2. Do the import
    //
    function importAll(info, done) {
      var proposals = info.proposals,
          issues    = info.issues,
          names;

      options.template = info.template;
      names = issues.reduce(function (all, issue) {
        var title = issue.title.replace('[Talk] ', '');
        all[title] = true;
        return all
      }, {});

      async.forEachLimit(
        proposals.filter(function (p) {
          if (names[p.title]) {
            console.log('Already exists | %s', p.title);
            return false;
          }

          return true;
        }),
        5,
        function (proposal, next) {
          importer.addIssue(options, proposal, next);
        },
        done
      );
    }
  ], callback);
};

//
// ### function addIssue(options, proposal, callback)
// Adds a single proposal as issue
//
importer.addIssue = function (options, proposal, callback) {
  var github   = options.github,
      repo     = options.repo.split('/'),
      rendered = options.template;

  Object.keys(proposal)
    .forEach(function (key) {
      rendered = rendered.replace('<' + key + '>', proposal[key]);
    });

  console.log('Creating | %s', proposal.title);
  github.issues.create({
    user: repo[0],
    repo: repo[1],
    title: proposal.title,
    body: rendered,
    labels: []
  }, callback);
};

//
// ### function readIssues (options, callback)
// Reads all the existing issues on the repo so we
// don't create duplicates
//
importer.readIssues = function (options, callback) {
  var github = options.github,
      repo   = options.repo.split('/');

  console.log('Reading issues | %s', options.repo);
  github.issues.repoIssues({
    user: repo[0],
    repo: repo[1]
  }, callback);
};

//
// ### function parse (file, callback)
// Parses the *.tsv file. Quite a brittle setup at the moment
//
importer.parse = function parse(file, callback) {
  console.log('Parsing | %s', file);
  fs.readFile(file, 'utf8', function (err, lines) {
    if (err) { return callback(err) }

    var proposals = lines.split('\n')
      .map(function (line) {
        var parts = line.split('\t');

        //
        // TODO: This is very brittle.
        //
        return {
          'author': [
            parts[1],
            parts[2],
            parts[3]
          ].filter(Boolean).join('\n'),
          'title': parts[4],
          'description': parts[5],
          'audience': parts[6],
          'anything-else': parts[7] || ''
        }
      });

    callback(null, proposals);
  });
};