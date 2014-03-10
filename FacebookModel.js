var App = App || {};
App.FacebookModel = Backbone.Model.extend({
  scriptLoaded: false,

  defaults: {
    appId: null,
    authResponse: null,
    status: null,
    scope: "email",
    namespace: null,

    user: null,

    share: {
      method: 'feed',
      caption: ''
    },
    shareResponse: null,
    scriptLoaded: false
  },
  /**
   *
   */
  initialize: function (attributes, options) {
    this.controller = options.controller;
    _.bindAll(this, "getLoginStatus", "loginResponse");

    this.on('change:user', this.setDefaultTimelineSharing, this);

    var isProd = (window.location.host.substr(0, 5) === 'local' || window.location.host.substr(0, 3) === 'dev') ? false : true;
    var beta = _('fb').getQueryParamByName();
    var debug = (!isProd && beta !== 'beta') ? false : false;

    this.initScript(debug, beta);
  },
  /**
   * @param debug (boolean) - if true, points to the SDK with console logging enabled
   * @param beta (boolean) - if ture, points to the beta release of the SDK
   */
  initScript: function (debug, beta) {

    var e = document.createElement('script');
    e.async = true;
    e.src = document.location.protocol + "//connect" + ((beta === 'beta') ? ".beta" : "") + ".facebook.net/en_US/all" + (debug ? "/debug" : "") + ".js";
    document.getElementById('fb-root').appendChild(e);

    window.fbAsyncInit = _.bind(this.loadScript, this);
  },
  /**
   *
   */
  loadScript: function () {
    this.set('scriptLoaded', true);

    FB.init({
      appId: this.get('appId'),
      status: true,
      cookie: false,
      // xfbml  : true,
      oauth: true,
      channelUrl: window.location.protocol + '//' + window.location.hostname + '/channel.html'
    });

    this.getLoginStatus(_.bind(this.getUserData, this));
  },
  /**
   *
   */
  clearUser: function () {
    console.log('CLEAR USER');
    this.set({user: null});
  },
  /**
   *
   */
  login: function () {
    console.log("scope: ", this.get("scope"));
    FB.login(_.bind(this.loginResponse, this), {scope: this.get('scope') });
  },
  /**
   *
   */
  logout: function (callback) {
    if (typeof callback != "function")
      callback = null;

    FB.getLoginStatus(_.bind(function(response) {
      // Make sure user is logged in before trying to logout, otherwise there is an error
      if(response.status == "connected") {
        FB.logout(_.bind(this.logoutResponse, this, callback));
      } else {
        this.logoutResponse(response, callback);
      }
    }, this), true);

  },
  /**
   *
   */
  logoutResponse: function (response, callback) {
    console.log("response", response, "callback", callback);
    // Flip the params and retry
    if(_.isFunction(response)) {
      console.log("response is a function");
      this.logoutResponse(callback, response)
      return;
    }

    console.log('logoutResponse', callback, response);
    this.set({authResponse: null, status: null});
    this.clearUser();
    if (typeof callback == "function")
      callback();
  },
  /**
   *
   */
  loginResponse: function (response) {

    console.log('loginResponse', response);
    this.set({"authResponse": response.authResponse, "status": response.status});
    console.log( this.toJSON() );
    this.getUserData();
  },
  /**
   *
   */
  getLoginStatus: function () {
    FB.getLoginStatus(_.bind(this.loginResponse, this), true);
  },
  /**
   * TODO: Needing to check status more often for the scenario where user logs out of Facebook in another tab.
   * Probably should restructure the getLoginStatus function in the future
   */
  getCurrentStatus: function(callback) {
    if (typeof callback != "function")
      callback = null;

    FB.getLoginStatus(_.bind(function(response) {
      // Make sure user is logged in before trying to logout, otherwise there is an error
      if(response.status == "connected") {
        this.loginResponse(response);
      } else {
        this.logoutResponse();
      }

      callback(response.status);
    }, this), true);
  },
  /**
   *
   */
  getUserData: function () {
    if (this.get('status') == 'connected') {
      if (!this.get('user') && this.get('authResponse') && this.get('authResponse').userID)
        FB.api('/' + this.get('authResponse').userID + '?fields=id,first_name,last_name,email,locale,username,gender,age_range,permissions', _.bind(this.setUser, this), true);
    }
  },
    /**
     *
     */
    setUser:function(response) {
        console.log('setUser', response);
        if(response.error) {
            this.logout();
            return false;
        }
        var user = {
            identifier: response.id
            ,first_name: response.first_name
            ,last_name: response.last_name
            ,email: response.email
            ,locale: response.locale
            ,avatar: document.location.protocol +  "//graph.facebook.com/" + response.username + "/picture"
            ,age_range: (!_.isUndefined(response.age_range.max)? response.age_range.min +'-'+ response.age_range.max : response.age_range.min + '+')
            ,permissions: (!_.isObject(response.permissions.data[0])? {} : response.permissions.data[0] )
            ,gender: (response.gender || 'U').substr(0, 1).toUpperCase()
        };
        console.log('formatted user', user);
        this.set({user: user});
    },
  /**
   *
   */
  isConnected: function (callback) {
    console.log('------------ IS CONNECTED? ---------------------------', callback);
    if (typeof callback != "function")
      return;
    if (this.get('status') == 'connected' && this.get('user')) {
      console.log("status user");
      callback(true);
    } else {
      this.set({status: null}, {silent: true});
      this.once("change:status", _.bind(function (model, value) {
        console.log('isConnected listener value', value, 'status:', this.get('status'), 'authresponse:', this.get('authResponse'));
        if (this.get('status') === "connected") {
          console.log("get user ");
          // get user data before sending back true
          this.once("change:user", _.bind(function () {
            callback(true);
          }), this);
          this.getUserData();
        } else {
          callback(false);
        }
      }, this));
      // make sure the SDK has loaded and the FB object is defined
      if (this.get('scriptLoaded') === true) {
        console.log("script loaded");
        this.login();
      } else {
        console.log("wait for script");
        // once we know the SDK has loaded we can init the Router
        this.once('change:scriptLoaded', _.bind(function () {
          this.login();
        }, this));
      }
    }
  },
  /**
   *
   */
  share: function (params, e) {
    var shareDefaults = this.get('share');
    _.extend(shareDefaults, params);
    console.log('share', params);
    FB.ui(shareDefaults, _.bind(this.shareResponse, this));
  },
    /**
     *
     */
    shareLink: function (params) {
        var str = "";
        for (var key in params)
            str += "&" + key + "=" + params[key];

        var url = "https://www.facebook.com/dialog/feed?app_id=" + this.get("appId") + str;
        return url;
    },
    /**
     *
     */
    shareResponse: function (response) {
        // console.log('shareResponse', response, $.type(response));
        if ($.type(response) === 'object' && _.has(response, 'post_id')) {
            this.set({VoteArtistShared: 1});
        }
        this.set({shareResponse: response});
    },

    turnOnTimelinePost: function(){
        this.set({timelineSharing: 1});
    },
    /**
     *
     */
    turnOffTimelinePost: function(){
        this.set({timelineSharing:0});
    }
});
