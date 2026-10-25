pipeline {
  agent any

  environment {
    IMAGE_TAG = "${env.BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Docker build') {
      steps {
        sh """
          docker build -f apps/web/Dockerfile -t atrium-web:${IMAGE_TAG} -t atrium-web:latest .
          docker build -f apps/api/Dockerfile -t atrium-api:${IMAGE_TAG} -t atrium-api:latest .
          docker build -f apps/worker/Dockerfile -t atrium-worker:${IMAGE_TAG} -t atrium-worker:latest .
        """
      }
    }

    stage('Load image into k3s') {
      steps {
        sh """
          for image in atrium-web atrium-api atrium-worker; do
            docker save \${image}:${IMAGE_TAG} | sudo k3s ctr images import - \
            || docker save \${image}:${IMAGE_TAG} | k3s ctr images import -
          done
        """
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        sh """
          KCTL='kubectl'
          command -v kubectl >/dev/null 2>&1 || KCTL='k3s kubectl'
          \$KCTL apply -f k8s/
          \$KCTL set image deployment/atrium-web atrium-web=atrium-web:${IMAGE_TAG}
          \$KCTL set image deployment/atrium-api atrium-api=atrium-api:${IMAGE_TAG}
          \$KCTL set image deployment/atrium-worker atrium-worker=atrium-worker:${IMAGE_TAG}
          \$KCTL rollout status deployment/atrium-web --timeout=180s
          \$KCTL rollout status deployment/atrium-api --timeout=180s
          \$KCTL rollout status deployment/atrium-worker --timeout=180s
          \$KCTL rollout status statefulset/postgres --timeout=180s
        """
      }
    }
  }
}
