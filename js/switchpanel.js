var switch_activate = function(index, direction) {
    var recess = "switch-recess-" + index;
    var but = "switch-button-" + index;
    if(direction == "up") {
        document.getElementById(recess).style.background = "rgba(235, 0, 0, 0.5)";
        document.getElementById(but).style.background = "#ffffff";    
        wavesurfer.setBand(index-1, 1);
    }
    else {
        document.getElementById(recess).style.background = "rgba(75, 75, 75, 0.5)";
        document.getElementById(but).style.background = "#424242";   
        wavesurfer.setBand(index-1, 0);
    }
};


var flip_all_switches = function(direction){
    for(var x=1; x<=24; x++) {
        document.getElementById("switch-" + direction + "-" + x).checked = true
        switch_activate(x, direction)
    }       
}

