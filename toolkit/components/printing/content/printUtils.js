# -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is mozilla.org code.
#
# The Initial Developer of the Original Code is
# Netscape Communications Corporation.
# Portions created by the Initial Developer are Copyright (C) 1998
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Blake Ross <blakeross@telocity.com>
#   Peter Annema <disttsc@bart.nl>
#   Samir Gehani <sgehani@netscape.com>
#   Pierre Chanial <p_ch@verizon.net>
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

var gPrintSettingsAreGlobal = false;
var gSavePrintSettings = false;
var gFocusedElement = null;

var PrintUtils = {

  showPageSetup: function ()
  {
    try {
      var printSettings = this.getPrintSettings();
      var PRINTPROMPTSVC = Components.classes["@mozilla.org/embedcomp/printingprompt-service;1"]
                                     .getService(Components.interfaces.nsIPrintingPromptService);
      PRINTPROMPTSVC.showPageSetup(window, printSettings, null);
      if (gSavePrintSettings) {
        // Page Setup data is a "native" setting on the Mac
        var PSSVC = Components.classes["@mozilla.org/gfx/printsettings-service;1"]
                              .getService(Components.interfaces.nsIPrintSettingsService);
        PSSVC.savePrintSettingsToPrefs(printSettings, true, printSettings.kInitSaveNativeData);
      }
    } catch (e) {
      dump("showPageSetup "+e+"\n");
      return false;
    }
    return true;
  },

  print: function (aWindow)
  {
    var webBrowserPrint = this.getWebBrowserPrint(aWindow);
    var printSettings = this.getPrintSettings();
    try {
      webBrowserPrint.print(printSettings, null);
      if (gPrintSettingsAreGlobal && gSavePrintSettings) {
        var PSSVC = Components.classes["@mozilla.org/gfx/printsettings-service;1"]
                              .getService(Components.interfaces.nsIPrintSettingsService);
        PSSVC.savePrintSettingsToPrefs(printSettings, true,
                                       printSettings.kInitSaveAll);
        PSSVC.savePrintSettingsToPrefs(printSettings, false,
                                       printSettings.kInitSavePrinterName);
      }
    } catch (e) {
      // Pressing cancel is expressed as an NS_ERROR_ABORT return value,
      // causing an exception to be thrown which we catch here.
      // Unfortunately this will also consume helpful failures, so add a
      // dump("print: "+e+"\n"); // if you need to debug
    }
  },

  // If aCallback is not null, it must be an object which has the following methods:
  // getPrintPreviewBrowser(), getSourceBrowser(),
  // getNavToolbox(), onEnter() and onExit().
  // If aCallback is null, then printPreview must previously have been called with
  // non-null aCallback and that object will be reused.
  printPreview: function (aCallback)
  {
    // if we're already in PP mode, don't set the callback; chances
    // are it is null because someone is calling printPreview() to
    // get us to refresh the display.
    if (!document.getElementById("print-preview-toolbar")) {
      this._callback = aCallback;
      this._sourceBrowser = aCallback.getSourceBrowser();
      this._originalTitle = this._sourceBrowser.contentDocument.title;
      this._originalURL = this._sourceBrowser.currentURI.spec;
    } else {
      // collapse the browser here -- it will be shown in
      // enterPrintPreview; this forces a reflow which fixes display
      // issues in bug 267422.
      this._sourceBrowser = this._callback.getPrintPreviewBrowser();
      this._sourceBrowser.collapsed = true;
    }

    this._webProgressPP = {};
    var ppParams        = {};
    var notifyOnOpen    = {};
    var webBrowserPrint = this.getWebBrowserPrint();
    var printSettings   = this.getPrintSettings();
    // Here we get the PrintingPromptService so we can display the PP Progress from script
    // For the browser implemented via XUL with the PP toolbar we cannot let it be
    // automatically opened from the print engine because the XUL scrollbars in the PP window
    // will layout before the content window and a crash will occur.
    // Doing it all from script, means it lays out before hand and we can let printing do its own thing
    var PPROMPTSVC = Components.classes["@mozilla.org/embedcomp/printingprompt-service;1"]
                               .getService(Components.interfaces.nsIPrintingPromptService);
    // just in case we are already printing, 
    // an error code could be returned if the Prgress Dialog is already displayed
    try {
      PPROMPTSVC.showProgress(window, webBrowserPrint, printSettings, this._obsPP, false,
                              this._webProgressPP, ppParams, notifyOnOpen);
      if (ppParams.value) {
        ppParams.value.docTitle = this._originalTitle;
        ppParams.value.docURL   = this._originalURL;
      }

      // this tells us whether we should continue on with PP or 
      // wait for the callback via the observer
      if (!notifyOnOpen.value.valueOf() || this._webProgressPP.value == null)
        this.enterPrintPreview(aWindow);
    } catch (e) {
      this.enterPrintPreview(aWindow);
    }
  },

  getWebBrowserPrint: function (aWindow)
  {
    var contentWindow = aWindow || window.content;
    return contentWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                        .getInterface(Components.interfaces.nsIWebBrowserPrint);
  },

  getPrintPreview: function() {
    return this._callback.getPrintPreviewBrowser().docShell.printPreview;
  },

  ////////////////////////////////////////
  // "private" methods. Don't use them. //
  ////////////////////////////////////////

  setPrinterDefaultsForSelectedPrinter: function (aPSSVC, aPrintSettings)
  {
    if (!aPrintSettings.printerName)
      aPrintSettings.printerName = aPSSVC.defaultPrinterName;

    // First get any defaults from the printer 
    aPSSVC.initPrintSettingsFromPrinter(aPrintSettings.printerName, aPrintSettings);
    // now augment them with any values from last time
    aPSSVC.initPrintSettingsFromPrefs(aPrintSettings, true,  aPrintSettings.kInitSaveAll);
  },

  getPrintSettings: function ()
  {
    var pref = Components.classes["@mozilla.org/preferences-service;1"]
                         .getService(Components.interfaces.nsIPrefBranch);
    if (pref) {
      gPrintSettingsAreGlobal = pref.getBoolPref("print.use_global_printsettings", false);
      gSavePrintSettings = pref.getBoolPref("print.save_print_settings", false);
    }

    var printSettings;
    try {
      var PSSVC = Components.classes["@mozilla.org/gfx/printsettings-service;1"]
                            .getService(Components.interfaces.nsIPrintSettingsService);
      if (gPrintSettingsAreGlobal) {
        printSettings = PSSVC.globalPrintSettings;
        this.setPrinterDefaultsForSelectedPrinter(PSSVC, printSettings);
      } else {
        printSettings = PSSVC.newPrintSettings;
      }
    } catch (e) {
      dump("getPrintSettings: "+e+"\n");
    }
    return printSettings;
  },

  _originalZoomValue: null,
  _closeHandlerPP: null,
  _webProgressPP: null,
  _callback: null,
  _sourceBrowser: null,
  _originalTitle: "",
  _originalURL: "",

  // This observer is called once the progress dialog has been "opened"
  _obsPP: 
  {
    observe: function(aSubject, aTopic, aData)
    {
      // delay the print preview to show the content of the progress dialog
      setTimeout(function () { PrintUtils.enterPrintPreview(); }, 0);
    },

    QueryInterface : function(iid)
    {
      if (iid.equals(Components.interfaces.nsIObserver) ||
          iid.equals(Components.interfaces.nsISupportsWeakReference) ||
          iid.equals(Components.interfaces.nsISupports))
        return this;   
      throw Components.results.NS_NOINTERFACE;
    }
  },

  enterPrintPreview: function ()
  {
    gFocusedElement = document.commandDispatcher.focusedElement;

    // Reset the zoom value and save it to be restored later.
    if (typeof ZoomManager == "object") {
      this._originalZoomValue = ZoomManager.zoom;
      ZoomManager.reset();
    }

    var webBrowserPrint;
    var printSettings  = this.getPrintSettings();
    var originalWindow = this._sourceBrowser.contentWindow;

    try {
      webBrowserPrint = this.getPrintPreview();
      webBrowserPrint.printPreview(printSettings, originalWindow,
                                   this._webProgressPP.value);
    } catch (e) {
      if (typeof ZoomManager == "object")
        ZoomManager.zoom = this._originalZoomValue;
      // Pressing cancel is expressed as an NS_ERROR_ABORT return value,
      // causing an exception to be thrown which we catch here.
      // Unfortunately this will also consume helpful failures, so add a
      // dump(e); // if you need to debug
      return;
    }

    var printPreviewTB = document.getElementById("print-preview-toolbar");
    if (printPreviewTB) {
      printPreviewTB.updateToolbar();
      var browser = this._callback.getPrintPreviewBrowser();
      browser.collapsed = false;
      browser.contentWindow.focus();
      return;
    }

    // show the toolbar after we go into print preview mode so
    // that we can initialize the toolbar with total num pages
    var XUL_NS =
      "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    printPreviewTB = document.createElementNS(XUL_NS, "toolbar");
    printPreviewTB.setAttribute("printpreview", true);
    printPreviewTB.id = "print-preview-toolbar";
    printPreviewTB.className = "toolbar-primary";

    var navToolbox = this._callback.getNavToolbox();
    navToolbox.parentNode.insertBefore(printPreviewTB, navToolbox);

    // copy the window close handler
    if (document.documentElement.hasAttribute("onclose"))
      this._closeHandlerPP = document.documentElement.getAttribute("onclose");
    else
      this._closeHandlerPP = null;
    document.documentElement.setAttribute("onclose", "PrintUtils.exitPrintPreview(); return false;");

    // disable chrome shortcuts...
    window.addEventListener("keypress", this.onKeyPressPP, true);

    var browser = this._callback.getPrintPreviewBrowser();
    browser.collapsed = false;
    browser.contentWindow.focus();

    // on Enter PP Call back
    this._callback.onEnter();
  },

  exitPrintPreview: function ()
  {
    window.removeEventListener("keypress", this.onKeyPressPP, true);

    // restore the old close handler
    document.documentElement.setAttribute("onclose", this._closeHandlerPP);
    this._closeHandlerPP = null;

    var webBrowserPrint = this.getPrintPreview();
    webBrowserPrint.exitPrintPreview();

    if (typeof ZoomManager == "object")
      ZoomManager.zoom = this._originalZoomValue;

    // remove the print preview toolbar
    var printPreviewTB = document.getElementById("print-preview-toolbar");
    this._callback.getNavToolbox().parentNode.removeChild(printPreviewTB);

    var fm = Components.classes["@mozilla.org/focus-manager;1"]
                       .getService(Components.interfaces.nsIFocusManager);
    if (gFocusedElement)
      fm.setFocus(gFocusedElement, fm.FLAG_NOSCROLL);
    else
      window.content.focus();
    gFocusedElement = null;

    this._callback.onExit();
  },

  onKeyPressPP: function (aEvent)
  {
    var closeKey;
    try {
      closeKey = document.getElementById("key_close")
                         .getAttribute("key");
      closeKey = aEvent["DOM_VK_"+closeKey];
    } catch (e) {}
    var isModif = aEvent.ctrlKey || aEvent.metaKey;
    // ESC and Ctrl-W exits the PP
    if (aEvent.keyCode == aEvent.DOM_VK_ESCAPE || isModif &&
        (aEvent.charCode == closeKey || aEvent.charCode == closeKey + 32)) {
      PrintUtils.exitPrintPreview();
    }
    else if (isModif) {
      var printPreviewTB = document.getElementById("print-preview-toolbar");
      var printKey = document.getElementById("printKb").getAttribute("key").toUpperCase();
      var pressedKey = String.fromCharCode(aEvent.charCode).toUpperCase();
      if (printKey == pressedKey) {
	  PrintUtils.print();
      }
    }
    // cancel shortkeys
    if (isModif) {
      aEvent.preventDefault();
      aEvent.stopPropagation();
    }
  }
}
