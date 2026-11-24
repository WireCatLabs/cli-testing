FROM ubuntu:24.04@sha256:562111b88caa79c71391c0c4d3c2114a7d5c35915c20561fd893cb1e07929e6b
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-rus tesseract-ocr-eng python3 curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# tessdata_best at a pinned commit, checked by sha256 (cli-testing rule 6).
ARG BEST=https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e12c65a915945e4c28e237a9b52bc4a8f39a0cec
RUN mkdir -p /opt/tessdata_best \
  && curl -sSfL -o /opt/tessdata_best/rus.traineddata $BEST/rus.traineddata \
  && curl -sSfL -o /opt/tessdata_best/eng.traineddata $BEST/eng.traineddata \
  && echo "b617eb6830ffabaaa795dd87ea7fd251adfe9cf0efe05eb9a2e8128b7728d6b6  /opt/tessdata_best/rus.traineddata" | sha256sum -c \
  && echo "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba  /opt/tessdata_best/eng.traineddata" | sha256sum -c \
  && cp /usr/share/tesseract-ocr/5/tessdata/osd.traineddata /opt/tessdata_best/ 2>/dev/null || true
COPY run.py /opt/run.py
ENTRYPOINT ["python3", "/opt/run.py"]
