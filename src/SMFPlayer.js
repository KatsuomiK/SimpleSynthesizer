const INTERVAL = 1 / 60;

class Track {
	constructor(player, pos, length) {
		this.player = player;
		
		this.pos = pos;
		this.endPos = pos + length;
		this.finished = false;
		
		this.nextEventTick = this.readDeltaTick();
	}
	
	update(currentTick) {
		if (this.finished) {
			return;
		}
		
		while (this.nextEventTick < currentTick) {
			// send MIDI message
			let statusByte = this.readByte();
			let dataByte1 = this.readByte();
			let dataByte2 = this.readByte();

			this.player.synthesizer.processMIDIMessage([statusByte, dataByte1, dataByte2]);

			if (this.pos >= this.endPos) {
				// end of track data
				this.finished = true;
				break;
			}
			
			// calculate next event tick
			this.nextEventTick += this.readDeltaTick();
		}
	}
	
	readByte() {
		return this.player.smf[this.pos++];
	}
	
	readDeltaTick() {
		return this.readByte();
	}
}

export default class SMFPlayer {
	constructor(synthesizer) {
		this.synthesizer = synthesizer;
		
		this.tempo = 120;
	}
	
	play(smf) {
		this.smf = smf;
		
		// read SMF header
		let pos = 8;
		
		function read2bytes() {
			return smf[pos++] << 8 | smf[pos++];
		}
		
		function read4bytes() {
			return smf[pos++] << 24 | smf[pos++] << 16 | smf[pos++] << 8 | smf[pos++];
		}
		
		let format = read2bytes();
		this.trackNumber = read2bytes();
		this.resolution = read2bytes();
		
		// error check
		const SMF_HEADER = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06];
		for (let i = 0; i < SMF_HEADER.length; i++) {
			if (this.smf[i] != SMF_HEADER[i]) {
				throw new Error("not a standard MIDI file");
			}
		}
		
		if (format !== 0 && format !== 1) {
			throw new Error("wrong SMF format");
		}
		
		if (format === 0 && this.trackNumber !== 1) {
			throw new Error("illegal track number");
		}
		
		this.tracks = [];
		
		// read track headers
		for (let i = 0; i < this.trackNumber; i++) {
			pos += 4;
			
			let length = read4bytes();
			this.tracks.push(new Track(this, pos, length));
			
			pos += length;
		}
		
		// set up timer
		this.prevTime = Date.now();
		this.currentTick = 0;
		
		if (!this.intervalId) {
			this.intervalId = setInterval(() => this.onInterval(), INTERVAL);
		}
	}
	
	stop() {
		clearInterval(this.intervalId);
		this.intervalId = null;
	}
	
	onInterval() {
		// calclate delta time
		let currentTime = Date.now();
		let deltaTime = currentTime - this.prevTime;
		this.prevTime = currentTime; 
		
		let quarterTime = 60 * 1000 / this.tempo;
		let tickTime = quarterTime / this.resolution;
			
		this.currentTick += deltaTime / tickTime;
		
		for (let track of this.tracks) {
			track.update(this.currentTick);
		}
		
		// stop when all tracks finish
		let playingTrack = 0;
		for (let track of this.tracks) {
			if (track.finished === false) {
				playingTrack++;
			}
		}
		if (playingTrack === 0) {
			this.stop();
		}
	}
}
