var debug = require('debug')('bandcamp::player');
var Analytics = require('./analytics.js');
var sprintf = require("sprintf-js").sprintf;
var Track = require('./track');
var Album = require('./album');
var EventEmitter = require('events').EventEmitter;
var assign = require('object-assign');

var _music;
var _mediaManager;
var _albums = {};
var _currentAlbum = new Album();
var _trackNum = -1;
var _duration = 0.0;
var _currentTime = 0.0;
var _loop = true;

function init() {
  debug('init player');

  _music = document.getElementById('music');
  _music.addEventListener('timeupdate', timeupdate, false);
  _music.addEventListener('loadedmetadata', loadedmetadata, false);

  _mediaManager = new cast.receiver.MediaManager(_music);

  _mediaManager.onEnded = function(){
    onFinish();
  };

  // deprecated: Unused in latest cast API.
  // workaround: Can't play next track when fire ended event.
  _mediaManager.customizedStatusCallback = (function(){
    var orig = _mediaManager.customizedStatusCallback.bind(_mediaManager);
    return function(status){
      if (status.playerState === 'IDLE' && status.idleReason === 'FINISHED') {
        onFinish();
      }
      return orig(status);
    };
  }());
}

function timeupdate() {
  _currentTime = _music.currentTime || 0;
  _duration = _music.duration || 0;
  Player.emitUpdateTime();
}

function loadedmetadata() {
  debug('loadedmetadata');

  var mediaInfo = new cast.receiver.media.MediaInformation();

  var album = Player.getAlbum();
  var track = album.track(_trackNum);
  mediaInfo.contentId = track.file();
  mediaInfo.duration = _music.duration;
  mediaInfo.metadata = {
    title: track.title(),
    num: track.num(),
    bandId: album.bandId(),
    albumId: album.id()
  };
  _mediaManager.setMediaInformation(mediaInfo, false);

  _mediaManager.broadcastStatus(true);
  _music.play();
}

function onFinish() {
  debug('onFinish');
  Player.playNext();

  var desc = Player.getAlbum().artist() + ' / ' + Player.getAlbum().title();
  Analytics.sendEvent('player', 'track ended', desc, _trackNum + 1, {
    nonInteraction: 1,
    trackNum: _trackNum + 1,
    utl: Player.getAlbum().url()
  });
}

var Player = assign({}, EventEmitter.prototype, {

  load: function(album){
    if (!_albums[album.bandId()]) {
      _albums[album.bandId()] = {};
    }
    _albums[album.bandId()][album.id()] = album;
  },

  play: function(trackNum, bandId, albumId){
    debug('play music: Track No.', this.getCurrentTrackNum());

    var prevAlbum = this.getAlbum();

    if (bandId !== undefined && albumId !== undefined) {
      this.setAlbum(bandId, albumId);
    }

    if (!this.getAlbum().hasPlayableFile()) {
      window.close();
    }

    var currentTrackNum = this.getCurrentTrackNum();
    var desc = this.getAlbum().artist() + ' / ' + this.getAlbum().title();

    if (trackNum !== undefined) {
      _trackNum = trackNum;
    }

    if (_loop && this.getAlbum().tracks().length <= this.getCurrentTrackNum()) {
      _trackNum = 0;

      Analytics.sendEvent('player', 'loop', desc, this.getCurrentTrackNum() + 1, {
        nonInteraction: 1,
        trackNum: this.getCurrentTrackNum() + 1,
        utl: this.getAlbum().url()
      });
    }

    var track = this.getAlbum().track(this.getCurrentTrackNum());

    if (!track.file()) {
      this.playNext();
      return;
    }

    if (this.getCurrentTrackNum() !== currentTrackNum ||
        !prevAlbum.isSameAlbum(bandId, albumId)) {
      _music.src = track.file();
      _music.load();
    } else {
      _music.play();
    }

    this.emitChange();

    Analytics.sendEvent('player', 'play', desc, this.getCurrentTrackNum() + 1, {
      trackNum: this.getCurrentTrackNum() + 1,
      utl: this.getAlbum().url()
    });
  },

  playNext: function(){
    this.play(this.getCurrentTrackNum() + 1);
  },

  stop: function(){
    _music.pause();
  },

  emitChange: function(){
    this.emit('CHANGE');
  },

  emitUpdateTime: function(){
    this.emit('UPDATE_TIME');
  },

  addChangeListener: function(callback){
    this.on('CHANGE', callback);
  },

  removeChangeListener: function(callback){
    this.removeListener('CHANGE', callback);
  },

  addTimeListener: function(callback){
    this.on('UPDATE_TIME', callback);
  },

  removeTimeListener: function(callback){
    this.removeListener('UPDATE_TIME', callback);
  },

  getAlbum: function(){
    if (_currentAlbum.title) {
      return _currentAlbum;
    }
    return new Album();
  },

  setAlbum: function(bandId, albumId){
    var album = this.getAlbum();

    if (album.bandId() !== bandId || album.id() !== albumId) {
      var currentAlbum = this.lookupAlbum(bandId, albumId);
      if (currentAlbum) {
        _currentAlbum = currentAlbum;
      }
    }
  },

  getCurrentTrackNum: function(){
    return _trackNum;
  },

  getCurrentTrack: function(){
    if (this.getAlbum().track) {
      return this.getAlbum().track(this.getCurrentTrackNum());
    }
    return new Track();
  },

  lookupAlbum: function(bandId, albumId){
    if (_albums[bandId] && _albums[bandId][albumId]) {
      return _albums[bandId][albumId];
    }
    return null;
  },

  getCurrentDuration: function(){
    var m = Math.floor(_duration / 60);
    var s = Math.floor(_duration % 60);
    return sprintf('%02d:%02d', m, s);
  },

  getCurrentTime: function(){
    var m = Math.floor(_currentTime / 60);
    var s = Math.floor(_currentTime % 60);
    return sprintf('%02d:%02d', m, s);
  },

  getCurrentPosition: function(){
    return (_currentTime / _duration) * 100;
  }
});

init();

module.exports = Player;
