const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Util = imports.misc.util;
const PopupMenu = imports.ui.popupMenu;
const UPowerGlib = imports.gi.UPowerGlib;
const Settings = imports.ui.settings;
const Calendar = imports.ui.appletManager.applets['halite-calendar@singon'].calendar;
const CinnamonDesktop = imports.gi.CinnamonDesktop;

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

function _onVertSepRepaint (area)
{
    let cr = area.get_context();
    let themeNode = area.get_theme_node();
    let [width, height] = area.get_surface_size();
    let stippleColor = themeNode.get_color('-stipple-color');
    let stippleWidth = themeNode.get_length('-stipple-width');
    let x = Math.floor(width/2) + 0.5;
    cr.moveTo(x, 0);
    cr.lineTo(x, height);
    Clutter.cairo_set_source_color(cr, stippleColor);
    cr.setDash([1, 3], 1); // Hard-code for now
    cr.setLineWidth(stippleWidth);
    cr.stroke();

    cr.$dispose();
};

function MyApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instance_id);

        this.setAllowedLayout(Applet.AllowedLayout.BOTH);

        try {
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.orientation = orientation;

            this._initContextMenu();

            // Date
            this._date = new St.Label();
            this._date.style_class = 'datemenu-date-label';
            this.menu.addActor(this._date);

            this.settings = new Settings.AppletSettings(this, "halite-calendar@singon", this.instance_id);

            // Calendar
            this._calendar = new Calendar.Calendar(this.settings);

            this.menu.addActor(this._calendar.actor);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            let item = new PopupMenu.PopupMenuItem(_("Date and Time Settings"))
            item.connect("activate", Lang.bind(this, this._onLaunchSettings));

            this.menu.addMenuItem(item);

            this.settings.bind("use-custom-format-calendar", "use_custom_format_cal", this._onSettingsChanged);
            this.settings.bind("custom-format-calendar", "custom_format_cal", this._onSettingsChanged);
            this.settings.bind("capitalize-calendar", "capitalize_cal", this._onSettingsChanged);

            this.settings.bind("use-custom-format-tooltip", "use_custom_format_tooltip", this._onSettingsChanged);
            this.settings.bind("custom-format-tooltip", "custom_format_tooltip", this._onSettingsChanged);
            this.settings.bind("capitalize-tooltip", "capitalize_tooltip", this._onSettingsChanged);

            this.settings.bind("use-custom-format-clock", "use_custom_format", this._onSettingsChanged);
            this.settings.bind("custom-format-clock", "custom_format", this._onSettingsChanged);
            this.settings.bind("capitalize-clock", "capitalize", this._onSettingsChanged);

            /* FIXME: Add gobject properties to the WallClock class to allow easier access from
             * its clients, and possibly a separate signal to notify of updates to these properties
             * (though GObject "changed" would be sufficient.) */
            this.desktop_settings = new Gio.Settings({ schema_id: "org.cinnamon.desktop.interface" });
            this.desktop_settings.connect("changed::clock-use-24h", Lang.bind(this, function(key) {
                this._onSettingsChanged();
            }));
            this.desktop_settings.connect("changed::clock-show-seconds", Lang.bind(this, function(key) {
                this._onSettingsChanged();
            }));

            this.clock = new CinnamonDesktop.WallClock();
            this.clock_notify_id = 0;

            // https://bugzilla.gnome.org/show_bug.cgi?id=655129
            this._upClient = new UPowerGlib.Client();
            try {
                this._upClient.connect('notify-resume', Lang.bind(this, this._updateClockAndDate));
            } catch (e) {
                this._upClient.connect('notify::resume', Lang.bind(this, this._updateClockAndDate));
            }
        }
        catch (e) {
            global.logError(e);
        }
    },

    _clockNotify: function(obj, pspec, data) {
        this._updateClockAndDate();
    },

    on_applet_clicked: function(event) {
        this.menu.toggle();
    },

    _onSettingsChanged: function() {
        this._updateClockFormatString();
        this._updateTooltipFormatString();
        this._updateDateFormatString();
        this._updateClockAndDate();
    },

    on_custom_format_button_pressed: function() {
        Util.spawnCommandLine("xdg-open http://www.foragoodstrftime.com/");
    },

    _onLaunchSettings: function() {
        this.menu.close();
        Util.spawnCommandLine("cinnamon-settings calendar");
    },

    _updateClockFormatString: function() {
        let in_vertical_panel = (this.orientation == St.Side.LEFT || this.orientation == St.Side.RIGHT);

        if (this.use_custom_format) {
            if (!this.clock.set_format_string(this.custom_format)) {
                global.logError("Calendar applet: bad time format string - check your string.");
                this.clock.set_format_string("~CLOCK FORMAT ERROR~ %l:%M %p");
            }
        } else if (in_vertical_panel) {
            let use_24h = this.desktop_settings.get_boolean("clock-use-24h");
            let show_seconds = this.desktop_settings.get_boolean("clock-show-seconds");

            if (use_24h) {
                if (show_seconds) {
                    this.clock.set_format_string("%H%n%M%n%S");
                } else {
                    this.clock.set_format_string("%H%n%M%");
                }
            } else {
                if (show_seconds) {
                    this.clock.set_format_string("%l%n%M%n%S");
                } else {
                    this.clock.set_format_string("%l%n%M%");
                }
            }
        } else {
            this.clock.set_format_string(null);
        }
    },

    _updateDateFormatString: function() {
        if (this.use_custom_format_cal) {
            this._dateFormatFull = this.custom_format_cal;
        } else {
            this._dateFormatFull = _("%A %B %-e, %Y");
        }
    },

    _updateTooltipFormatString: function() {
        if (this.use_custom_format_tooltip) {
            this._tooltipFormatFull = this.custom_format_tooltip;
        } else {
            this._tooltipFormatFull = _("%A %B %e, %H:%M");
        }
    },

    _updateClockAndDate: function() {
        let label_string = this.clock.get_clock();

        if (!this.use_custom_format || this.capitalize) {
            label_string = label_string.capitalize();
        }

        this.set_applet_label(label_string);

        /* Applet content - st_label_set_text and set_applet_tooltip both compare new to
         * existing strings before proceeding, so no need to check here also */
        let date = this.clock.get_clock_for_format(this._dateFormatFull);
        if (this.use_custom_format_cal && this.capitalize_cal) {
            date = date.capitalize();
        }

        let tooltip = this.clock.get_clock_for_format(this._tooltipFormatFull);
        if (this.use_custom_format_tooltip && this.capitalize_tooltip) {
            tooltip = tooltip.capitalize();
        }

        this._date.set_text(date);
        this.set_applet_tooltip(tooltip);
    },

    on_applet_added_to_panel: function() {
        this._onSettingsChanged();

        if (this.clock_notify_id == 0) {
            this.clock_notify_id = this.clock.connect("notify::clock", () => this._clockNotify());
        }

        /* Populates the calendar so our menu allocation is correct for animation */
        this._updateCalendar();
    },

    on_applet_removed_from_panel: function() {
        if (this.clock_notify_id > 0) {
            this.clock.disconnect(this.clock_notify_id);
            this.clock_notify_id = 0;
        }
    },

    _initContextMenu: function () {
        this.menu = new Applet.AppletPopupMenu(this, this.orientation);
        this.menuManager.addMenu(this.menu);

        // Whenever the menu is opened, select today
        this.menu.connect('open-state-changed', Lang.bind(this, function(menu, isOpen) {
            if (isOpen) {
                this._updateCalendar();
            }
        }));
    },

    _updateCalendar: function () {
        let now = new Date();

        this._calendar.setDate(now, true);
    },

    on_orientation_changed: function (orientation) {
        this.orientation = orientation;
        this.menu.setOrientation(orientation);
        this._onSettingsChanged();
    }

};

function main(metadata, orientation, panel_height, instance_id) {
    let myApplet = new MyApplet(orientation, panel_height, instance_id);
    return myApplet;
}
